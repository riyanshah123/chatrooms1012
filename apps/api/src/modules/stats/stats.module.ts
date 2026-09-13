import { Controller, Get, Module } from "@nestjs/common";
import { Public } from "@/common/decorators";
import { PrismaService } from "@/infra/prisma/prisma.service";
import { RedisService } from "@/infra/redis/redis.service";

export interface PlatformStats {
  activeRooms: number;
  topics: number;
  messagesToday: number;
  users: number;
}

/**
 * Landing-page hero stats. Cheap COUNTs, cached 60s in Redis — every visitor
 * hits this, so it must never touch the DB more than once a minute.
 */
@Controller("stats")
class StatsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  async get(): Promise<PlatformStats> {
    const cached = await this.redis.getJSON<PlatformStats>("cr:cache:stats");
    if (cached) return cached;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [activeRooms, topics, messagesToday, users] = await Promise.all([
      this.prisma.chatroom.count({ where: { status: "ACTIVE" } }),
      this.prisma.prompt.count(),
      this.prisma.message.count({ where: { createdAt: { gte: startOfDay } } }),
      this.prisma.anonymousProfile.count(),
    ]);

    const stats: PlatformStats = { activeRooms, topics, messagesToday, users };
    await this.redis.setJSON("cr:cache:stats", stats, 60);
    return stats;
  }
}

@Module({ controllers: [StatsController] })
export class StatsModule {}
