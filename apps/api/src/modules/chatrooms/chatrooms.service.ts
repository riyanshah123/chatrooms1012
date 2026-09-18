import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  SocketEvents,
  type PublicProfile,
  type QueueAdmittedPayload,
  type UserJoinedPayload,
  type UserKickedPayload,
  type UserLeftPayload,
  type UserMutedPayload,
  type WaitingQueuePayload,
} from "@chatrooms/contracts";
import { PrismaService } from "@/infra/prisma/prisma.service";
import { RedisService } from "@/infra/redis/redis.service";
import { ChatEventsService } from "@/modules/chat-gateway/chat-events.service";

export interface RoomView {
  id: string;
  type: "PROMPT" | "TOPIC";
  title: string;
  capacity: number;
  memberCount: number;
  queueLength: number;
  mySeat: "MEMBER" | "OWNER" | "MODERATOR" | null;
  myQueuePosition: number | null;
  category: { name: string; icon: string | null } | null;
  prompt: { id: string; title: string; description: string | null } | null;
  topic: { slug: string; title: string } | null;
  members: PublicProfile[];
  pinned: Array<{ id: string; content: string; authorUsername: string | null }>;
}

@Injectable()
export class ChatroomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly events: ChatEventsService,
  ) {}

  // ── Read ───────────────────────────────────────────────────────────────

  /**
   * Public room snapshot for the prompt detail page (no auth). Shows current
   * seated members (anonymous profiles — safe to expose) + live online count
   * so anonymous visitors can preview a room before joining.
   */
  async getPublicRoom(roomId: string): Promise<{
    id: string;
    capacity: number;
    memberCount: number;
    onlineCount: number;
    members: PublicProfile[];
  }> {
    const room = await this.prisma.chatroom.findUnique({
      where: { id: roomId },
      select: { id: true, capacity: true, status: true },
    });
    if (!room || room.status === "CLOSED") {
      throw new NotFoundException({ code: "ROOM_NOT_FOUND", message: "Room not found." });
    }
    const keys = this.redis.roomKeys(roomId);
    const [memberIds, onlineCount] = await Promise.all([
      this.redis.client.smembers(keys.members),
      this.redis.client.scard(keys.online),
    ]);
    const members = memberIds.length
      ? await this.prisma.anonymousProfile.findMany({
          where: { id: { in: memberIds } },
          select: { id: true, username: true, avatarUrl: true, reputation: true },
        })
      : [];
    return {
      id: room.id,
      capacity: room.capacity,
      memberCount: memberIds.length,
      onlineCount,
      members,
    };
  }

  async getRoom(roomId: string, profileId: string): Promise<RoomView> {
    const room = await this.prisma.chatroom.findUnique({
      where: { id: roomId },
      include: {
        prompt: {
          select: {
            id: true,
            title: true,
            description: true,
            category: { select: { name: true, icon: true } },
          },
        },
        topic: {
          select: {
            slug: true,
            title: true,
            category: { select: { name: true, icon: true } },
          },
        },
      },
    });
    if (!room || room.status === "CLOSED") {
      throw new NotFoundException({ code: "ROOM_NOT_FOUND", message: "Room not found." });
    }

    const keys = this.redis.roomKeys(roomId);
    const [memberIds, queueLength, myRank] = await Promise.all([
      this.redis.client.smembers(keys.members),
      this.redis.client.zcard(keys.queue),
      this.redis.client.zrank(keys.queue, profileId),
    ]);

    const [members, myParticipant, pinned] = await Promise.all([
      memberIds.length
        ? this.prisma.anonymousProfile.findMany({
            where: { id: { in: memberIds } },
            select: { id: true, username: true, avatarUrl: true, reputation: true },
          })
        : Promise.resolve([]),
      this.prisma.participant.findUnique({
        where: { chatroomId_profileId: { chatroomId: roomId, profileId } },
      }),
      this.prisma.message.findMany({
        where: { chatroomId: roomId, isPinned: true, deletedAt: null },
        orderBy: { pinnedAt: "desc" },
        take: 3,
        select: { id: true, content: true, author: { select: { username: true } } },
      }),
    ]);

    const seated = memberIds.includes(profileId);
    return {
      id: room.id,
      type: room.type,
      title: room.prompt?.title ?? room.topic?.title ?? "Room",
      capacity: room.capacity,
      memberCount: memberIds.length,
      queueLength,
      mySeat: seated ? ((myParticipant?.role as RoomView["mySeat"]) ?? "MEMBER") : null,
      myQueuePosition: myRank === null ? null : Number(myRank) + 1,
      category: room.prompt?.category ?? room.topic?.category ?? null,
      prompt: room.prompt
        ? { id: room.prompt.id, title: room.prompt.title, description: room.prompt.description }
        : null,
      topic: room.topic ? { slug: room.topic.slug, title: room.topic.title } : null,
      members,
      pinned: pinned.map((p) => ({
        id: p.id,
        content: p.content,
        authorUsername: p.author?.username ?? null,
      })),
    };
  }

  // ── Join / leave / queue ───────────────────────────────────────────────

  /**
   * Take a seat. Atomic in Redis; on success the durable Participant row is
   * upserted and user_joined broadcast. On a full room → 409 ROOM_FULL with
   * the queue length so the client can offer "join the waiting queue".
   */
  async join(roomId: string, profileId: string): Promise<{ joined: true }> {
    const room = await this.getActiveRoom(roomId);
    await this.assertNotBlocked(roomId, profileId);

    const seated = await this.redis.tryJoinRoom(roomId, profileId, room.capacity);
    if (!seated) {
      const queueLength = await this.redis.client.zcard(this.redis.roomKeys(roomId).queue);
      throw new HttpException(
        { code: "ROOM_FULL", message: "This room is full.", details: { queueLength } },
        HttpStatus.CONFLICT,
      );
    }

    await this.persistJoin(roomId, profileId);
    await this.broadcastJoin(roomId, profileId);
    return { joined: true };
  }

  /**
   * Leave the seat. Atomically frees it and — per spec — the next waiting
   * user enters AUTOMATICALLY: we seat them in the same flow, notify them on
   * their personal channel, and re-broadcast queue positions to the rest.
   */
  async leave(roomId: string, profileId: string): Promise<{ left: true }> {
    const promotedId = await this.redis.leaveAndPromote(roomId, profileId);

    await this.prisma.participant.updateMany({
      where: { chatroomId: roomId, profileId, leftAt: null },
      data: { leftAt: new Date() },
    });
    // Keeps the live-occupancy index in step so the feed can rank this room.
    const memberCount = await this.redis.syncRoomActivity(roomId);
    this.events.toRoom(roomId, SocketEvents.USER_LEFT, {
      roomId,
      profileId,
      memberCount,
    } satisfies UserLeftPayload);

    if (promotedId) await this.admitFromQueue(roomId, promotedId);
    return { left: true };
  }

  /**
   * Join the waiting queue (or get seated instantly if a seat freed up
   * between the ROOM_FULL response and this call — the script handles it).
   */
  async enqueue(
    roomId: string,
    profileId: string,
  ): Promise<{ status: "SEATED" } | { status: "WAITING"; position: number }> {
    const room = await this.getActiveRoom(roomId);
    await this.assertNotBlocked(roomId, profileId);

    const result = await this.redis.enqueueWaiting(roomId, profileId, room.capacity);
    if (result === -1) return { status: "SEATED" }; // already had a seat
    if (result === 0) {
      await this.persistJoin(roomId, profileId);
      await this.broadcastJoin(roomId, profileId);
      return { status: "SEATED" };
    }

    // Durable mirror of the queue entry.
    await this.prisma.waitingQueueEntry.upsert({
      where: {
        chatroomId_profileId_status: { chatroomId: roomId, profileId, status: "WAITING" },
      },
      update: {},
      create: { chatroomId: roomId, profileId, status: "WAITING" },
    });
    return { status: "WAITING", position: result };
  }

  async cancelQueue(roomId: string, profileId: string): Promise<{ cancelled: true }> {
    await this.redis.client.zrem(this.redis.roomKeys(roomId).queue, profileId);
    await this.prisma.waitingQueueEntry.updateMany({
      where: { chatroomId: roomId, profileId, status: "WAITING" },
      data: { status: "CANCELLED", resolvedAt: new Date() },
    });
    await this.broadcastQueuePositions(roomId);
    return { cancelled: true };
  }

  /** Seat release used by the disconnect sweeper (Step 14 worker). */
  async releaseSeat(roomId: string, profileId: string): Promise<void> {
    await this.leave(roomId, profileId);
  }

  // ── Moderation: kick & mute ────────────────────────────────────────────

  async kick(
    roomId: string,
    actorProfileId: string,
    targetProfileId: string,
    reason?: string,
  ): Promise<{ kicked: true }> {
    await this.assertRoomModerator(roomId, actorProfileId);
    if (actorProfileId === targetProfileId) {
      throw new ForbiddenException({ code: "SELF_KICK", message: "Use leave instead." });
    }

    // Kick = forced leave + a 10-minute rejoin block so they can't bounce back.
    await this.redis.client.set(`cr:block:${roomId}:${targetProfileId}`, "1", "EX", 600);
    this.events.toRoom(roomId, SocketEvents.USER_KICKED, {
      roomId,
      profileId: targetProfileId,
      reason,
    } satisfies UserKickedPayload);
    await this.leave(roomId, targetProfileId);
    return { kicked: true };
  }

  async mute(
    roomId: string,
    actorProfileId: string,
    targetProfileId: string,
    minutes: number,
    reason?: string,
  ): Promise<{ mutedUntil: string }> {
    await this.assertRoomModerator(roomId, actorProfileId);
    const mutedUntil = new Date(Date.now() + minutes * 60_000);

    await this.prisma.roomMute.create({
      data: {
        chatroomId: roomId,
        profileId: targetProfileId,
        issuedById: actorProfileId,
        mutedUntil,
        reason,
      },
    });
    // Redis mirror — O(1) check on every message send.
    await this.redis.client.set(
      `cr:mute:${roomId}:${targetProfileId}`,
      "1",
      "EX",
      minutes * 60,
    );
    this.events.toRoom(roomId, SocketEvents.USER_MUTED, {
      roomId,
      profileId: targetProfileId,
      mutedUntil: mutedUntil.toISOString(),
    } satisfies UserMutedPayload);
    return { mutedUntil: mutedUntil.toISOString() };
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private async getActiveRoom(roomId: string) {
    const room = await this.prisma.chatroom.findUnique({ where: { id: roomId } });
    if (!room || room.status !== "ACTIVE") {
      throw new NotFoundException({ code: "ROOM_NOT_FOUND", message: "Room not found." });
    }
    return room;
  }

  private async assertNotBlocked(roomId: string, profileId: string): Promise<void> {
    if (await this.redis.client.exists(`cr:block:${roomId}:${profileId}`)) {
      throw new ForbiddenException({
        code: "TEMPORARILY_BLOCKED",
        message: "You were removed from this room. Try again later.",
      });
    }
  }

  private async assertRoomModerator(roomId: string, profileId: string): Promise<void> {
    const p = await this.prisma.participant.findUnique({
      where: { chatroomId_profileId: { chatroomId: roomId, profileId } },
    });
    const isRoomMod = p && p.leftAt === null && (p.role === "OWNER" || p.role === "MODERATOR");
    if (!isRoomMod) {
      // Site-wide staff bypass room roles.
      const user = await this.prisma.anonymousProfile.findUnique({
        where: { id: profileId },
        select: { user: { select: { role: true } } },
      });
      if (user?.user.role === "USER") {
        throw new ForbiddenException({ code: "NOT_ROOM_MODERATOR", message: "Not allowed." });
      }
    }
  }

  private async persistJoin(roomId: string, profileId: string): Promise<void> {
    const existing = await this.prisma.participant.findUnique({
      where: { chatroomId_profileId: { chatroomId: roomId, profileId } },
    });
    if (existing) {
      if (existing.leftAt) {
        await this.prisma.participant.update({
          where: { id: existing.id },
          data: { leftAt: null, joinedAt: new Date() },
        });
      }
      return; // rejoin — don't recount roomsJoined
    }
    await this.prisma.$transaction([
      this.prisma.participant.create({ data: { chatroomId: roomId, profileId } }),
      this.prisma.anonymousProfile.update({
        where: { id: profileId },
        data: { roomsJoined: { increment: 1 } },
      }),
    ]);
  }

  private async broadcastJoin(roomId: string, profileId: string): Promise<void> {
    const [profile, memberCount] = await Promise.all([
      this.prisma.anonymousProfile.findUnique({
        where: { id: profileId },
        select: { id: true, username: true, avatarUrl: true, reputation: true },
      }),
      this.redis.syncRoomActivity(roomId), // refresh live-occupancy index
    ]);
    if (!profile) return;
    this.events.toRoom(roomId, SocketEvents.USER_JOINED, {
      roomId,
      profile,
      memberCount,
    } satisfies UserJoinedPayload);
  }

  /** Auto-admission: seat the promoted user, notify, refresh queue ranks. */
  private async admitFromQueue(roomId: string, profileId: string): Promise<void> {
    const room = await this.getActiveRoom(roomId);
    const seated = await this.redis.tryJoinRoom(roomId, profileId, room.capacity);
    if (!seated) return; // seat was re-taken in the same instant; they keep their rank

    await this.persistJoin(roomId, profileId);
    await this.prisma.waitingQueueEntry.updateMany({
      where: { chatroomId: roomId, profileId, status: "WAITING" },
      data: { status: "ADMITTED", admittedAt: new Date(), resolvedAt: new Date() },
    });
    await this.prisma.notification.create({
      data: {
        profileId,
        type: "QUEUE_ADMITTED",
        payload: { roomId },
      },
    });

    this.events.toProfile(profileId, SocketEvents.QUEUE_ADMITTED, {
      roomId,
      confirmWithinSec: 0, // already seated — client just opens the room
    } satisfies QueueAdmittedPayload);
    await this.broadcastJoin(roomId, profileId);
    await this.broadcastQueuePositions(roomId);
  }

  /** Push fresh 1-based positions to everyone still waiting (≤ dozens). */
  private async broadcastQueuePositions(roomId: string): Promise<void> {
    const waiting = await this.redis.client.zrange(this.redis.roomKeys(roomId).queue, 0, -1);
    waiting.forEach((pid, idx) => {
      this.events.toProfile(pid, SocketEvents.WAITING_QUEUE, {
        roomId,
        position: idx + 1,
        queueLength: waiting.length,
      } satisfies WaitingQueuePayload);
    });
  }
}
