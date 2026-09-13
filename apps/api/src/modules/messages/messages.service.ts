import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  SocketEvents,
  type MessageView,
  type Paginated,
  type ReactionEmoji,
} from "@chatrooms/contracts";
import { decodeCursor, encodeCursor } from "@/common/utils/cursor";
import { PrismaService } from "@/infra/prisma/prisma.service";
import { RedisService } from "@/infra/redis/redis.service";
import { ChatEventsService } from "@/modules/chat-gateway/chat-events.service";
import { filterProfanity, sanitizeText } from "@/modules/moderation/profanity.filter";

const PAGE_SIZE = 40;
/** Spam guard: max messages per user per 10-second window, per room. */
const BURST_LIMIT = 8;

const messageInclude = {
  author: { select: { id: true, username: true, avatarUrl: true, reputation: true } },
  replyTo: { select: { id: true, content: true, deletedAt: true, author: { select: { username: true } } } },
  reactions: { select: { emoji: true, profileId: true } },
} satisfies Prisma.MessageInclude;
type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly events: ChatEventsService,
  ) {}

  // ── History (newest-first keyset pagination) ───────────────────────────

  async history(
    roomId: string,
    profileId: string,
    cursorRaw?: string,
  ): Promise<Paginated<MessageView>> {
    await this.assertSeated(roomId, profileId);
    const cursor = decodeCursor(cursorRaw);

    const rows = await this.prisma.message.findMany({
      where: {
        chatroomId: roomId,
        hiddenAt: null,
        ...(cursor && {
          OR: [
            { createdAt: { lt: cursor.ts } },
            { createdAt: cursor.ts, id: { lt: cursor.id } },
          ],
        }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      include: messageInclude,
    });

    const hasMore = rows.length > PAGE_SIZE;
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const last = items[items.length - 1];
    return {
      items: items.map((m) => this.toView(m, profileId)),
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  // ── Create (used by REST and by the gateway in Step 13) ────────────────

  async create(
    roomId: string,
    profileId: string,
    input: {
      type: "TEXT" | "GIF";
      content: string;
      gifUrl?: string;
      replyToId?: string;
      clientNonce?: string;
    },
  ): Promise<MessageView> {
    await this.assertSeated(roomId, profileId);
    await this.assertNotMuted(roomId, profileId);
    await this.assertNotBursting(roomId, profileId);

    const sanitized = sanitizeText(input.content).slice(0, 2000);
    if (!sanitized && input.type === "TEXT") {
      throw new HttpException(
        { code: "EMPTY_MESSAGE", message: "Message is empty." },
        HttpStatus.BAD_REQUEST,
      );
    }
    const { clean } = filterProfanity(sanitized);

    if (input.replyToId) {
      const parent = await this.prisma.message.findFirst({
        where: { id: input.replyToId, chatroomId: roomId },
        select: { id: true },
      });
      if (!parent) {
        throw new NotFoundException({ code: "REPLY_TARGET_GONE", message: "Message not found." });
      }
    }
    if (input.type === "GIF" && !this.isAllowedGifUrl(input.gifUrl)) {
      throw new HttpException(
        { code: "BAD_GIF_URL", message: "GIF must come from a supported provider." },
        HttpStatus.BAD_REQUEST,
      );
    }

    const row = await this.prisma.message.create({
      data: {
        chatroomId: roomId,
        authorId: profileId,
        type: input.type,
        content: clean,
        gifUrl: input.type === "GIF" ? input.gifUrl : null,
        replyToId: input.replyToId,
      },
      include: messageInclude,
    });

    // Live counter in Redis; durable Prompt.messageCount is rolled up by the
    // counters worker (Step 20) instead of a hot-path UPDATE per message.
    await this.redis.client.incr(`cr:cnt:msg:${roomId}`);

    const view = { ...this.toView(row, profileId), clientNonce: input.clientNonce };
    this.events.toRoom(roomId, SocketEvents.MESSAGE_CREATED, view);
    return view;
  }

  // ── Edit / delete ──────────────────────────────────────────────────────

  async edit(roomId: string, profileId: string, messageId: string, content: string) {
    const msg = await this.getOwnMessage(roomId, profileId, messageId);
    const { clean } = filterProfanity(sanitizeText(content).slice(0, 2000));
    const editedAt = new Date();
    await this.prisma.message.update({
      where: { id: msg.id },
      data: { content: clean, editedAt },
    });
    this.events.toRoom(roomId, SocketEvents.MESSAGE_EDITED, {
      roomId,
      messageId,
      content: clean,
      editedAt: editedAt.toISOString(),
    });
    return { edited: true };
  }

  async delete(roomId: string, profileId: string, messageId: string) {
    const msg = await this.prisma.message.findFirst({
      where: { id: messageId, chatroomId: roomId, deletedAt: null },
      select: { id: true, authorId: true },
    });
    if (!msg) throw new NotFoundException({ code: "MESSAGE_NOT_FOUND", message: "Not found." });
    if (msg.authorId !== profileId) {
      // Room moderators may remove others' messages.
      const p = await this.prisma.participant.findUnique({
        where: { chatroomId_profileId: { chatroomId: roomId, profileId } },
      });
      if (!p || p.leftAt !== null || p.role === "MEMBER") {
        throw new ForbiddenException({ code: "NOT_YOUR_MESSAGE", message: "Not allowed." });
      }
    }
    await this.prisma.message.update({
      where: { id: msg.id },
      data: { deletedAt: new Date(), content: "", gifUrl: null, isPinned: false },
    });
    this.events.toRoom(roomId, SocketEvents.MESSAGE_DELETED, { roomId, messageId });
    return { deleted: true };
  }

  // ── Reactions & pins ───────────────────────────────────────────────────

  /** Toggle: same (message, profile, emoji) twice = add then remove. */
  async toggleReaction(roomId: string, profileId: string, messageId: string, emoji: ReactionEmoji) {
    await this.assertSeated(roomId, profileId);
    const existing = await this.prisma.reaction.findUnique({
      where: { messageId_profileId_emoji: { messageId, profileId, emoji } },
    });
    const added = !existing;
    if (existing) {
      await this.prisma.reaction.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.reaction.create({ data: { messageId, profileId, emoji } });
    }
    const count = await this.prisma.reaction.count({ where: { messageId, emoji } });
    this.events.toRoom(roomId, SocketEvents.REACTION_UPDATED, {
      roomId,
      messageId,
      emoji,
      count,
      profileId,
      added,
    });
    return { added, count };
  }

  async setPinned(roomId: string, profileId: string, messageId: string, pinned: boolean) {
    const p = await this.prisma.participant.findUnique({
      where: { chatroomId_profileId: { chatroomId: roomId, profileId } },
    });
    if (!p || p.leftAt !== null || p.role === "MEMBER") {
      throw new ForbiddenException({ code: "NOT_ROOM_MODERATOR", message: "Not allowed." });
    }
    await this.prisma.message.update({
      where: { id: messageId },
      data: pinned
        ? { isPinned: true, pinnedAt: new Date(), pinnedById: profileId }
        : { isPinned: false, pinnedAt: null, pinnedById: null },
    });
    this.events.toRoom(roomId, SocketEvents.MESSAGE_PINNED, { roomId, messageId, pinned });
    return { pinned };
  }

  /** Unread pointer — client sends the newest message id it rendered. */
  async markRead(roomId: string, profileId: string, messageId: string) {
    await this.prisma.participant.updateMany({
      where: { chatroomId: roomId, profileId },
      data: { lastReadMessageId: messageId, lastReadAt: new Date() },
    });
    return { ok: true };
  }

  // ── Guards & mapping ───────────────────────────────────────────────────

  private async assertSeated(roomId: string, profileId: string): Promise<void> {
    const seated = await this.redis.client.sismember(
      this.redis.roomKeys(roomId).members,
      profileId,
    );
    if (!seated) {
      throw new ForbiddenException({
        code: "NOT_A_PARTICIPANT",
        message: "Join the room first.",
      });
    }
  }

  private async assertNotMuted(roomId: string, profileId: string): Promise<void> {
    if (await this.redis.client.exists(`cr:mute:${roomId}:${profileId}`)) {
      throw new ForbiddenException({ code: "MUTED", message: "You are muted in this room." });
    }
  }

  private async assertNotBursting(roomId: string, profileId: string): Promise<void> {
    const key = `cr:burst:${roomId}:${profileId}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) await this.redis.client.expire(key, 10);
    if (count > BURST_LIMIT) {
      throw new HttpException(
        { code: "SLOW_DOWN", message: "You're sending messages too fast." },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async getOwnMessage(roomId: string, profileId: string, messageId: string) {
    const msg = await this.prisma.message.findFirst({
      where: { id: messageId, chatroomId: roomId, authorId: profileId, deletedAt: null },
      select: { id: true },
    });
    if (!msg) {
      throw new ForbiddenException({ code: "NOT_YOUR_MESSAGE", message: "Not allowed." });
    }
    return msg;
  }

  private isAllowedGifUrl(url?: string): boolean {
    if (!url) return false;
    try {
      const host = new URL(url).hostname;
      return ["media.giphy.com", "media.tenor.com", "i.giphy.com"].some(
        (h) => host === h || host.endsWith(`.${h}`),
      );
    } catch {
      return false;
    }
  }

  private toView(m: MessageRow, viewerProfileId: string): MessageView {
    const byEmoji = new Map<string, { count: number; mine: boolean }>();
    for (const r of m.reactions) {
      const entry = byEmoji.get(r.emoji) ?? { count: 0, mine: false };
      entry.count += 1;
      if (r.profileId === viewerProfileId) entry.mine = true;
      byEmoji.set(r.emoji, entry);
    }
    const deleted = m.deletedAt !== null;
    return {
      id: m.id,
      roomId: m.chatroomId,
      type: m.type,
      content: deleted ? "" : m.content,
      gifUrl: deleted ? null : m.gifUrl,
      author: m.author,
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            authorUsername: m.replyTo.author?.username ?? null,
            snippet: m.replyTo.deletedAt ? "(deleted)" : m.replyTo.content.slice(0, 80),
          }
        : null,
      reactions: [...byEmoji.entries()].map(([emoji, v]) => ({
        emoji: emoji as ReactionEmoji,
        count: v.count,
        reactedByMe: v.mine,
      })),
      isPinned: m.isPinned,
      deleted,
      editedAt: m.editedAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    };
  }
}
