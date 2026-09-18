import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

/**
 * Redis access + the atomic scripts that make the 10-seat rooms and FIFO
 * waiting queue race-free under concurrent joins across many API pods.
 *
 * Key layout (all namespaced under "cr:"):
 *   cr:room:{id}:members   SET   profileIds currently seated
 *   cr:room:{id}:queue     ZSET  profileId → enqueue epoch-millis (FIFO)
 *   cr:room:{id}:online    SET   profileIds with an open socket in the room
 *   cr:room:{id}:typing    ZSET  profileId → expiry millis (self-pruning)
 *   cr:mute:{room}:{prof}  STRING with TTL — O(1) mute check per message
 *   cr:cnt:msg:{roomId}    INT   live message counter (worker rolls up to PG)
 *   cr:cache:*             JSON  feed pages, topic lists (short TTL)
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  /** General commands + script execution. */
  readonly client: Redis;
  /** Dedicated connections required by the Socket.IO redis-adapter. */
  readonly pubClient: Redis;
  readonly subClient: Redis;

  constructor(config: ConfigService) {
    const url = config.getOrThrow<string>("REDIS_URL");
    this.client = new Redis(url, { maxRetriesPerRequest: 3 });
    this.pubClient = new Redis(url);
    this.subClient = new Redis(url);
  }

  async onModuleInit(): Promise<void> {
    await this.client.ping();
    this.defineScripts();
    this.logger.log("Redis connected");
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      this.client.quit(),
      this.pubClient.quit(),
      this.subClient.quit(),
    ]);
  }

  // ── Atomic scripts ─────────────────────────────────────────────────────
  // Defined via ioredis `defineCommand` (EVALSHA under the hood). Each is a
  // single atomic step on the Redis side — no check-then-act races between
  // pods.

  private defineScripts(): void {
    /**
     * tryJoinRoom(membersKey, queueKey, profileId, capacity)
     * → 1  seated (or already seated — idempotent)
     * → 0  room full, caller may offer the queue
     * Also removes the profile from the queue if it was waiting (covers the
     * QUEUE_ADMITTED confirm path with the same primitive).
     */
    this.client.defineCommand("tryJoinRoom", {
      numberOfKeys: 2,
      lua: `
        local members, queue = KEYS[1], KEYS[2]
        local profile, capacity = ARGV[1], tonumber(ARGV[2])
        if redis.call('SISMEMBER', members, profile) == 1 then return 1 end
        if redis.call('SCARD', members) >= capacity then return 0 end
        redis.call('SADD', members, profile)
        redis.call('ZREM', queue, profile)
        return 1
      `,
    });

    /**
     * leaveAndPromote(membersKey, queueKey, profileId)
     * → profileId of the promoted head-of-queue, or false if queue empty.
     * The seat is NOT given away in Redis — the promoted user gets a
     * QUEUE_ADMITTED notification and must confirm within the grace window
     * (service layer re-runs tryJoinRoom on confirm; expiry promotes next).
     */
    this.client.defineCommand("leaveAndPromote", {
      numberOfKeys: 2,
      lua: `
        redis.call('SREM', KEYS[1], ARGV[1])
        local head = redis.call('ZRANGE', KEYS[2], 0, 0)
        if head[1] then return head[1] end
        return false
      `,
    });

    /**
     * enqueueWaiting(membersKey, queueKey, profileId, nowMillis, capacity)
     * → -1 already seated · 0 seated directly (a seat freed meanwhile)
     * → N  queue position (1-based)
     */
    this.client.defineCommand("enqueueWaiting", {
      numberOfKeys: 2,
      lua: `
        local members, queue = KEYS[1], KEYS[2]
        local profile, now, capacity = ARGV[1], ARGV[2], tonumber(ARGV[3])
        if redis.call('SISMEMBER', members, profile) == 1 then return -1 end
        if redis.call('SCARD', members) < capacity then
          redis.call('SADD', members, profile)
          return 0
        end
        redis.call('ZADD', queue, 'NX', now, profile)
        return redis.call('ZRANK', queue, profile) + 1
      `,
    });
  }

  // ── Typed wrappers (ioredis defineCommand attaches methods dynamically) ─

  /**
   * Live occupancy index: chatroomId -> current member count.
   * Lets the feed pull "rooms with people in them but not full" in one cheap
   * range query instead of checking every room's member set.
   */
  static readonly ACTIVE_ROOMS = "cr:activerooms";

  /** Recompute a room's entry after anyone joins or leaves. */
  async syncRoomActivity(roomId: string): Promise<number> {
    const count = await this.client.scard(this.roomKeys(roomId).members);
    if (count > 0) {
      await this.client.zadd(RedisService.ACTIVE_ROOMS, count, roomId);
    } else {
      await this.client.zrem(RedisService.ACTIVE_ROOMS, roomId);
    }
    return count;
  }

  /**
   * Chatroom ids that currently hold between `min` and `max` people, busiest
   * first. Used to float joinable, already-alive rooms to the top of the feed.
   */
  async liveRoomIds(min = 1, max = 9, limit = 12): Promise<string[]> {
    return this.client.zrevrangebyscore(
      RedisService.ACTIVE_ROOMS,
      max,
      min,
      "LIMIT",
      0,
      limit,
    );
  }

  /** Rooms sitting at (or above) capacity, i.e. nobody else can get in. */
  async fullRoomIds(capacity = 10, limit = 30): Promise<string[]> {
    return this.client.zrevrangebyscore(
      RedisService.ACTIVE_ROOMS,
      "+inf",
      capacity,
      "LIMIT",
      0,
      limit,
    );
  }

  roomKeys(roomId: string) {
    return {
      members: `cr:room:${roomId}:members`,
      queue: `cr:room:${roomId}:queue`,
      online: `cr:room:${roomId}:online`,
      typing: `cr:room:${roomId}:typing`,
    };
  }

  async tryJoinRoom(roomId: string, profileId: string, capacity: number): Promise<boolean> {
    const k = this.roomKeys(roomId);
    const res = await (this.client as any).tryJoinRoom(k.members, k.queue, profileId, capacity);
    return res === 1;
  }

  async leaveAndPromote(roomId: string, profileId: string): Promise<string | null> {
    const k = this.roomKeys(roomId);
    const res = await (this.client as any).leaveAndPromote(k.members, k.queue, profileId);
    return typeof res === "string" ? res : null;
  }

  /** -1 already member · 0 seated directly · ≥1 queue position */
  async enqueueWaiting(roomId: string, profileId: string, capacity: number): Promise<number> {
    const k = this.roomKeys(roomId);
    return (this.client as any).enqueueWaiting(
      k.members, k.queue, profileId, Date.now(), capacity,
    );
  }

  // ── Small cache helpers ────────────────────────────────────────────────

  async getJSON<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async setJSON(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  }
}
