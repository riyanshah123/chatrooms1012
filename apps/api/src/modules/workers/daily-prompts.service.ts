import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { RoomType } from "@prisma/client";
import { PrismaService } from "@/infra/prisma/prisma.service";
import { RedisService } from "@/infra/redis/redis.service";
import { DAILY_PROMPT_POOL } from "./daily-prompts.pool";

/** How often the tick runs (the day guard below does the real gating). */
const TICK_MS = 30 * 60_000; // every 30 min
const HOW_MANY_PER_DAY = 4;
const BOOST_ZSET = "cr:boost";
const BOOST_HOURS = 48;

/**
 * Posts a few fresh prompts every day so the feed is never the same two days
 * running.
 *
 * Runs on a timer and gates itself with a Redis key for the current date, so
 * exactly one pod posts per day no matter how many are running. Prompts come
 * from DAILY_PROMPT_POOL, posted once each (matched by title). When the pool
 * is used up it re surfaces older prompts by boosting them instead, so the
 * top of the feed keeps changing either way.
 */
@Injectable()
export class DailyPromptsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DailyPromptsService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit(): void {
    // Run shortly after boot, then on a timer.
    setTimeout(() => void this.tick(), 60_000);
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    // NX + 36h TTL: first pod to claim today's slot does the work.
    const claimed = await this.redis.client.set(
      `cr:daily:${today}`,
      "1",
      "EX",
      36 * 3600,
      "NX",
    );
    if (!claimed) return;

    try {
      const posted = await this.postFromPool();
      if (posted === 0) await this.resurfaceOlder();
    } catch (e) {
      this.logger.error(`daily prompts failed: ${(e as Error).message}`);
      // Release the day claim so a later tick can retry.
      await this.redis.client.del(`cr:daily:${today}`);
    }
  }

  /** Create up to HOW_MANY_PER_DAY pool prompts that aren't posted yet. */
  private async postFromPool(): Promise<number> {
    const systemProfileId = await this.systemProfileId();
    if (!systemProfileId) return 0;

    const titles = DAILY_PROMPT_POOL.map((p) => p.title);
    const existing = await this.prisma.prompt.findMany({
      where: { title: { in: titles } },
      select: { title: true },
    });
    const used = new Set(existing.map((p) => p.title));
    const pending = DAILY_PROMPT_POOL.filter((p) => !used.has(p.title)).slice(
      0,
      HOW_MANY_PER_DAY,
    );
    if (!pending.length) return 0;

    let created = 0;
    for (const entry of pending) {
      const category = await this.prisma.category.findUnique({
        where: { slug: entry.category },
        select: { id: true },
      });
      if (!category) continue;

      const prompt = await this.prisma.prompt.create({
        data: {
          title: entry.title,
          description: entry.description,
          tags: entry.tags,
          categoryId: category.id,
          creatorId: systemProfileId,
          maxUsers: 10,
          chatroom: { create: { type: RoomType.PROMPT, capacity: 10 } },
        },
        select: { id: true },
      });
      // Pin it to the top for a couple of days so people actually see it.
      await this.redis.client.zadd(
        BOOST_ZSET,
        Date.now() + BOOST_HOURS * 3_600_000,
        prompt.id,
      );
      created++;
    }

    if (created) {
      await this.bustFeedCaches();
      this.logger.log(`Posted ${created} fresh prompts for today`);
    }
    return created;
  }

  /** Pool exhausted: boost a few older prompts so the feed still changes. */
  private async resurfaceOlder(): Promise<void> {
    const alreadyBoosted = await this.redis.client.zrange(BOOST_ZSET, 0, -1);
    const candidates = await this.prisma.prompt.findMany({
      where: {
        visibility: "PUBLIC",
        chatroom: { status: "ACTIVE" },
        ...(alreadyBoosted.length && { id: { notIn: alreadyBoosted } }),
      },
      orderBy: { trendScore: "desc" },
      take: 40,
      select: { id: true },
    });
    if (!candidates.length) return;

    // Random pick from the top pool so it differs day to day.
    const picked = candidates
      .sort(() => Math.random() - 0.5)
      .slice(0, HOW_MANY_PER_DAY);
    for (const p of picked) {
      await this.redis.client.zadd(
        BOOST_ZSET,
        Date.now() + 24 * 3_600_000,
        p.id,
      );
    }
    await this.bustFeedCaches();
    this.logger.log(`Pool empty, re surfaced ${picked.length} prompts instead`);
  }

  private async systemProfileId(): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: "system@chatrooms.local" },
      select: { profile: { select: { id: true } } },
    });
    return user?.profile?.id ?? null;
  }

  private async bustFeedCaches(): Promise<void> {
    const keys = await this.redis.client.keys("cr:cache:feed:*");
    if (keys.length) await this.redis.client.del(...keys);
    const trending = await this.redis.client.keys("cr:cache:trending:*");
    if (trending.length) await this.redis.client.del(...trending);
  }
}
