import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaService } from "@/infra/prisma/prisma.service";
import { RedisService } from "@/infra/redis/redis.service";

const TICK_MS = 30_000;
const LOCK_KEY = "cr:lock:counters";

/**
 * Counters rollup. The message hot path only does a Redis INCR
 * (cr:cnt:msg:{roomId}); this worker periodically folds those deltas into
 * the durable Prompt.messageCount used by feed cards — one batched write
 * per active room per 30 s instead of one Postgres UPDATE per message.
 * Also feeds the prompt trend score (recent activity, decayed by the
 * ranking's reliance on fresh increments).
 */
@Injectable()
export class CountersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CountersService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    const locked = await this.redis.client.set(LOCK_KEY, "1", "EX", 25, "NX");
    if (!locked) return;

    try {
      // SCAN (never KEYS) — non-blocking iteration over active counters.
      let cursor = "0";
      do {
        const [next, keys] = await this.redis.client.scan(
          cursor,
          "MATCH",
          "cr:cnt:msg:*",
          "COUNT",
          200,
        );
        cursor = next;
        for (const key of keys) await this.flushCounter(key);
      } while (cursor !== "0");
    } catch (e) {
      this.logger.error(`rollup failed: ${(e as Error).message}`);
    }
  }

  private async flushCounter(key: string): Promise<void> {
    // GETDEL is atomic: increments arriving after the read land in a fresh
    // counter and are picked up next tick — nothing is lost or double-counted.
    const raw = await this.redis.client.getdel(key);
    const delta = Number(raw ?? 0);
    if (!delta) return;

    const roomId = key.slice("cr:cnt:msg:".length);
    const room = await this.prisma.chatroom.findUnique({
      where: { id: roomId },
      select: { promptId: true },
    });
    if (!room?.promptId) return; // topic rooms don't surface message counts

    await this.prisma.prompt.update({
      where: { id: room.promptId },
      data: {
        messageCount: { increment: delta },
        // Cheap hotness signal: recent messages bump the score; the feed's
        // "hot" sort reads it. (A real decay pass belongs to Step 20.)
        trendScore: { increment: delta },
      },
    });
  }
}
