import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaService } from "@/infra/prisma/prisma.service";
import { RedisService } from "@/infra/redis/redis.service";

const TICK_MS = 10 * 60_000; // 10 minutes
const LOCK_KEY = "cr:lock:trends";
/** Multiplier per tick → half-life ≈ 1 h. New activity (CountersService
 *  increments) must keep outpacing decay for something to stay "hot". */
const DECAY = 0.89;
/** Below this a score is just noise — snap to 0 to keep the index tight. */
const FLOOR = 0.5;

/**
 * Trend decay. CountersService pushes trendScore UP with message activity;
 * this worker pulls it DOWN exponentially, so the "hot" feed sort and the
 * trending-topics strip surface what's active NOW, not what was busy last
 * week. Topics additionally get their isTrending flag maintained here.
 */
@Injectable()
export class TrendsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrendsService.name);
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
    const locked = await this.redis.client.set(LOCK_KEY, "1", "EX", 60, "NX");
    if (!locked) return;

    try {
      // Set-based UPDATEs — no row streaming through Node.
      await this.prisma.$executeRaw`
        UPDATE prompts SET "trendScore" =
          CASE WHEN "trendScore" * ${DECAY} < ${FLOOR} THEN 0
               ELSE "trendScore" * ${DECAY} END
        WHERE "trendScore" > 0`;
      await this.prisma.$executeRaw`
        UPDATE topics SET "trendScore" =
          CASE WHEN "trendScore" * ${DECAY} < ${FLOOR} THEN 0
               ELSE "trendScore" * ${DECAY} END
        WHERE "trendScore" > 0`;
      // A topic is "trending" while its decayed score clears the bar.
      await this.prisma.$executeRaw`
        UPDATE topics SET "isTrending" = ("trendScore" >= 25)
        WHERE "isTrending" <> ("trendScore" >= 25)`;

      // Scores changed → cached first pages are stale; drop them early.
      const keys = await this.redis.client.keys("cr:cache:feed:hot:*");
      if (keys.length) await this.redis.client.del(...keys);
      const topicKeys = await this.redis.client.keys("cr:cache:topics:*");
      if (topicKeys.length) await this.redis.client.del(...topicKeys);
    } catch (e) {
      this.logger.error(`trend decay failed: ${(e as Error).message}`);
    }
  }
}
