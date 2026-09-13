import { HttpException } from "@nestjs/common";
import { ChatroomsService } from "./chatrooms.service";
import { PrismaService } from "@/infra/prisma/prisma.service";
import { RedisService } from "@/infra/redis/redis.service";
import { ChatEventsService } from "@/modules/chat-gateway/chat-events.service";

/** Join / Room Full / queue / auto-admission — the product's core mechanic. */
describe("ChatroomsService", () => {
  let prisma: Record<string, Record<string, jest.Mock>>;
  let redis: {
    tryJoinRoom: jest.Mock;
    leaveAndPromote: jest.Mock;
    enqueueWaiting: jest.Mock;
    roomKeys: (id: string) => Record<string, string>;
    client: Record<string, jest.Mock>;
  };
  let events: { toRoom: jest.Mock; toProfile: jest.Mock };
  let service: ChatroomsService;

  const activeRoom = { id: "room1", status: "ACTIVE", capacity: 10 };
  const profile = { id: "p1", username: "BlueWolf21", avatarUrl: null, reputation: 0 };

  beforeEach(() => {
    prisma = {
      chatroom: { findUnique: jest.fn().mockResolvedValue(activeRoom) },
      participant: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      anonymousProfile: {
        findUnique: jest.fn().mockResolvedValue(profile),
        update: jest.fn().mockResolvedValue({}),
      },
      waitingQueueEntry: {
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      notification: { create: jest.fn().mockResolvedValue({}) },
      $transaction: { apply: jest.fn() } as never,
    };
    // $transaction executes the array of promises it's given
    (prisma as Record<string, unknown>).$transaction = jest.fn((ops) => Promise.all(ops));

    redis = {
      tryJoinRoom: jest.fn(),
      leaveAndPromote: jest.fn(),
      enqueueWaiting: jest.fn(),
      roomKeys: (id: string) => ({
        members: `cr:room:${id}:members`,
        queue: `cr:room:${id}:queue`,
        online: `cr:room:${id}:online`,
        typing: `cr:room:${id}:typing`,
      }),
      client: {
        zcard: jest.fn().mockResolvedValue(0),
        zrange: jest.fn().mockResolvedValue([]),
        zrem: jest.fn().mockResolvedValue(1),
        zrank: jest.fn().mockResolvedValue(null),
        scard: jest.fn().mockResolvedValue(1),
        smembers: jest.fn().mockResolvedValue([]),
        exists: jest.fn().mockResolvedValue(0),
        set: jest.fn().mockResolvedValue("OK"),
      },
    };
    events = { toRoom: jest.fn(), toProfile: jest.fn() };

    service = new ChatroomsService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
      events as unknown as ChatEventsService,
    );
  });

  describe("join", () => {
    it("seats the user, persists the participant, and broadcasts user_joined", async () => {
      redis.tryJoinRoom.mockResolvedValue(true);

      await expect(service.join("room1", "p1")).resolves.toEqual({ joined: true });
      expect(prisma.participant.create).toHaveBeenCalled();
      expect(events.toRoom).toHaveBeenCalledWith(
        "room1",
        "user_joined",
        expect.objectContaining({ roomId: "room1" }),
      );
    });

    it("throws 409 ROOM_FULL with the queue length when seats are gone", async () => {
      redis.tryJoinRoom.mockResolvedValue(false);
      redis.client.zcard.mockResolvedValue(3);

      const err = await service.join("room1", "p1").catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(409);
      expect(err.getResponse()).toMatchObject({
        code: "ROOM_FULL",
        details: { queueLength: 3 },
      });
      expect(prisma.participant.create).not.toHaveBeenCalled();
    });

    it("refuses kicked users during their rejoin block", async () => {
      redis.client.exists.mockResolvedValue(1); // cr:block key present
      await expect(service.join("room1", "p1")).rejects.toMatchObject({
        response: { code: "TEMPORARILY_BLOCKED" },
      });
      expect(redis.tryJoinRoom).not.toHaveBeenCalled();
    });
  });

  describe("leave → auto-admission", () => {
    it("frees the seat and automatically seats the queue head", async () => {
      redis.leaveAndPromote.mockResolvedValue("p2"); // someone was waiting
      redis.tryJoinRoom.mockResolvedValue(true); // their admission succeeds

      await service.leave("room1", "p1");

      // leaver marked out + broadcast
      expect(prisma.participant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { chatroomId: "room1", profileId: "p1", leftAt: null },
        }),
      );
      expect(events.toRoom).toHaveBeenCalledWith(
        "room1",
        "user_left",
        expect.objectContaining({ profileId: "p1" }),
      );
      // promoted user notified on their personal channel
      expect(events.toProfile).toHaveBeenCalledWith(
        "p2",
        "queue_admitted",
        expect.objectContaining({ roomId: "room1" }),
      );
      expect(prisma.notification.create).toHaveBeenCalled();
    });

    it("no promotion when the queue is empty", async () => {
      redis.leaveAndPromote.mockResolvedValue(null);
      await service.leave("room1", "p1");
      expect(events.toProfile).not.toHaveBeenCalled();
    });
  });

  describe("enqueue", () => {
    it("seats directly when a seat freed up in the meantime", async () => {
      redis.enqueueWaiting.mockResolvedValue(0);
      await expect(service.enqueue("room1", "p1")).resolves.toEqual({
        status: "SEATED",
      });
      expect(prisma.participant.create).toHaveBeenCalled();
    });

    it("returns the 1-based position when queued", async () => {
      redis.enqueueWaiting.mockResolvedValue(2);
      await expect(service.enqueue("room1", "p1")).resolves.toEqual({
        status: "WAITING",
        position: 2,
      });
      expect(prisma.waitingQueueEntry.upsert).toHaveBeenCalled();
    });
  });
});
