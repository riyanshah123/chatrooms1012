import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaService } from "@/infra/prisma/prisma.service";
import { RedisService } from "@/infra/redis/redis.service";
import { ChatroomsService } from "@/modules/chatrooms/chatrooms.service";

const TICK_MS = 15_000;
const LOCK_KEY = "cr:lock:sweeper";

/**
 * Seat sweeper — the safety net that keeps 10-seat rooms honest.
 *
 * The gateway gives a disconnecting user a grace period (refresh ≠ losing
 * your seat) by scheduling them in the `cr:sweepq` ZSET (score = when grace
 * ends; reconnecting removes the entry). Every tick, ONE pod (Redis NX
 * lock) pops the due entries and, for each profile still offline:
 *   1. releases every seat they hold → ChatroomsService.leave() fires the
 *      user_left broadcast AND auto-admits the next queued user,
 *   2. removes them from any waiting queues (an offline user must not be
 *      auto-admitted into a room they'd immediately abandon), refreshing
 *      queue positions for those still in line.
 */
@Injectable()
export class SweeperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SweeperService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly chatrooms: ChatroomsService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    // Leader election per tick: first pod to grab the lock does the work.
    const locked = await this.redis.client.set(LOCK_KEY, "1", "EX", 10, "NX");
    if (!locked) return;

    try {
      const due = await this.redis.client.zrangebyscore("cr:sweepq", 0, Date.now());
      for (const profileId of due) {
        await this.sweepProfile(profileId);
        await this.redis.client.zrem("cr:sweepq", profileId);
      }
    } catch (e) {
      this.logger.error(`sweep failed: ${(e as Error).message}`);
    }
  }

  private async sweepProfile(profileId: string): Promise<void> {
    // Seats currently held (durable record).
    const seats = await this.prisma.participant.findMany({
      where: { profileId, leftAt: null },
      select: { chatroomId: true },
    });
    for (const seat of seats) {
      // Double-check against the live set — the durable row may lag a
      // legitimate REST leave that already freed the Redis seat.
      const stillSeated = await this.redis.client.sismember(
        this.redis.roomKeys(seat.chatroomId).members,
        profileId,
      );
      if (stillSeated) {
        this.logger.log(`releasing seat: room=${seat.chatroomId} profile=${profileId}`);
        await this.chatrooms.releaseSeat(seat.chatroomId, profileId);
      } else {
        await this.prisma.participant.updateMany({
          where: { chatroomId: seat.chatroomId, profileId, leftAt: null },
          data: { leftAt: new Date() },
        });
      }
    }

    // Drop them from waiting queues they were standing in.
    const waiting = await this.prisma.waitingQueueEntry.findMany({
      where: { profileId, status: "WAITING" },
      select: { chatroomId: true },
    });
    for (const w of waiting) {
      await this.chatrooms.cancelQueue(w.chatroomId, profileId);
    }
  }
}
