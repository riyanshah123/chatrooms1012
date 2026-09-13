import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Paginated } from "@chatrooms/contracts";
import { decodeCursor, toPage } from "@/common/utils/cursor";
import { PrismaService } from "@/infra/prisma/prisma.service";
import { RedisService } from "@/infra/redis/redis.service";

export interface TopicCard {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  category: { slug: string; name: string; icon: string | null };
  chatroomId: string;
  isTrending: boolean;
  createdAt: Date;
}

const PAGE_SIZE = 20;

@Injectable()
export class TopicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Topic browser: trending-first within an optional category filter.
   * First page (no cursor) is cached — it's the page every visitor loads.
   */
  async list(opts: { category?: string; cursor?: string }): Promise<Paginated<TopicCard>> {
    const cacheKey = `cr:cache:topics:${opts.category ?? "all"}`;
    if (!opts.cursor) {
      const hit = await this.redis.getJSON<Paginated<TopicCard>>(cacheKey);
      if (hit) return hit;
    }

    const cursor = decodeCursor(opts.cursor);
    const where: Prisma.TopicWhereInput = {
      ...(opts.category && { category: { slug: opts.category } }),
      ...(cursor && {
        OR: [
          { createdAt: { lt: cursor.ts } },
          { createdAt: cursor.ts, id: { lt: cursor.id } },
        ],
      }),
    };

    const rows = await this.prisma.topic.findMany({
      where,
      // Trending float to the top on the first page; cursor pages fall back
      // to pure recency so keyset pagination stays consistent.
      orderBy: cursor
        ? [{ createdAt: "desc" }, { id: "desc" }]
        : [{ isTrending: "desc" }, { trendScore: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      include: {
        category: { select: { slug: true, name: true, icon: true } },
        chatroom: { select: { id: true } },
      },
    });

    const page = toPage(rows, PAGE_SIZE, (r) => ({ createdAt: r.createdAt, id: r.id }));
    const result: Paginated<TopicCard> = {
      items: page.items.map((t) => ({
        id: t.id,
        slug: t.slug,
        title: t.title,
        description: t.description,
        imageUrl: t.imageUrl,
        category: t.category,
        chatroomId: t.chatroom!.id,
        isTrending: t.isTrending,
        createdAt: t.createdAt,
      })),
      nextCursor: page.nextCursor,
    };

    if (!opts.cursor) await this.redis.setJSON(cacheKey, result, 60);
    return result;
  }

  async bySlug(slug: string): Promise<TopicCard> {
    const t = await this.prisma.topic.findUnique({
      where: { slug },
      include: {
        category: { select: { slug: true, name: true, icon: true } },
        chatroom: { select: { id: true } },
      },
    });
    if (!t) throw new NotFoundException({ code: "TOPIC_NOT_FOUND", message: "Topic not found." });
    return {
      id: t.id,
      slug: t.slug,
      title: t.title,
      description: t.description,
      imageUrl: t.imageUrl,
      category: t.category,
      chatroomId: t.chatroom!.id,
      isTrending: t.isTrending,
      createdAt: t.createdAt,
    };
  }

  /** Toggle favorite; returns the new state. */
  async toggleFavorite(profileId: string, topicId: string): Promise<{ favorited: boolean }> {
    const existing = await this.prisma.favorite.findUnique({
      where: { profileId_topicId: { profileId, topicId } },
    });
    if (existing) {
      await this.prisma.favorite.delete({ where: { id: existing.id } });
      return { favorited: false };
    }
    await this.prisma.favorite.create({ data: { profileId, topicId } });
    return { favorited: true };
  }
}
