import { Controller, Get, Module } from "@nestjs/common";
import { Roles } from "@/common/decorators";
import { PrismaService } from "@/infra/prisma/prisma.service";
import { RedisService } from "@/infra/redis/redis.service";

interface DayPoint {
  day: string;
  count: number;
}

export interface Analytics {
  totals: {
    users: number;
    prompts: number;
    rooms: number;
    messages: number;
    messagesToday: number;
    signupsToday: number;
  };
  live: {
    peopleInRooms: number;
    activeRooms: number;
  };
  daily: {
    signups: DayPoint[];
    messages: DayPoint[];
    rooms: DayPoint[];
  };
  topRooms: Array<{ title: string; messages: number; category: string }>;
}

/**
 * Analytics drawn from the app's own data. Deliberately separate from
 * third-party page analytics: this answers "is the product working" (are
 * people signing up, opening rooms, actually talking) rather than "how many
 * page views".
 */
@Roles("ADMIN")
@Controller("admin/analytics")
class AnalyticsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async get(): Promise<Analytics> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Postgres does the bucketing; we only ship 14 rows per series.
    const series = (table: string, column = "createdAt") =>
      this.prisma.$queryRawUnsafe<Array<{ day: Date; count: bigint }>>(
        `SELECT date_trunc('day', "${column}") AS day, count(*)::bigint AS count
         FROM "${table}"
         WHERE "${column}" > now() - interval '14 days'
         GROUP BY 1 ORDER BY 1`,
      );

    const [
      users,
      prompts,
      rooms,
      messages,
      messagesToday,
      signupsToday,
      signupSeries,
      messageSeries,
      roomSeries,
      topRoomRows,
      activeRoomIds,
    ] = await Promise.all([
      this.prisma.anonymousProfile.count(),
      this.prisma.prompt.count(),
      this.prisma.chatroom.count({ where: { status: "ACTIVE" } }),
      this.prisma.message.count(),
      this.prisma.message.count({ where: { createdAt: { gte: startOfDay } } }),
      this.prisma.user.count({ where: { createdAt: { gte: startOfDay } } }),
      series("users"),
      series("messages"),
      series("prompts"),
      this.prisma.prompt.findMany({
        where: { messageCount: { gt: 0 } },
        orderBy: { messageCount: "desc" },
        take: 10,
        select: { title: true, messageCount: true, category: { select: { name: true } } },
      }),
      this.redis.liveRoomIds(1, 1_000_000, 500),
    ]);

    // How many people are sitting in rooms right now.
    let peopleInRooms = 0;
    if (activeRoomIds.length) {
      const pipeline = this.redis.client.pipeline();
      for (const id of activeRoomIds) pipeline.scard(this.redis.roomKeys(id).members);
      const counts = (await pipeline.exec()) ?? [];
      peopleInRooms = counts.reduce((sum, c) => sum + Number(c?.[1] ?? 0), 0);
    }

    const toPoints = (rows: Array<{ day: Date; count: bigint }>): DayPoint[] =>
      rows.map((r) => ({
        day: new Date(r.day).toISOString().slice(0, 10),
        count: Number(r.count),
      }));

    return {
      totals: { users, prompts, rooms, messages, messagesToday, signupsToday },
      live: { peopleInRooms, activeRooms: activeRoomIds.length },
      daily: {
        signups: toPoints(signupSeries),
        messages: toPoints(messageSeries),
        rooms: toPoints(roomSeries),
      },
      topRooms: topRoomRows.map((r) => ({
        title: r.title,
        messages: r.messageCount,
        category: r.category.name,
      })),
    };
  }
}

@Module({ controllers: [AnalyticsController] })
export class AnalyticsModule {}
