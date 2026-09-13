import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, RoomType } from "@prisma/client";
import type { Paginated, PublicProfile, Visibility } from "@chatrooms/contracts";
import { decodeCursor, toPage } from "@/common/utils/cursor";
import { PrismaService } from "@/infra/prisma/prisma.service";
import { RedisService } from "@/infra/redis/redis.service";
import { SearchService } from "@/infra/search/search.service";
import type { CreatePromptDto, FeedQueryDto } from "./dto/prompt.schemas";

/** Feed card — everything the PromptCard component renders. */
export interface PromptCard {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  category: { slug: string; name: string; icon: string | null };
  creator: PublicProfile;
  chatroomId: string;
  visibility: Visibility;
  maxUsers: number;
  onlineCount: number; // live, from Redis
  messageCount: number;
  boosted: boolean; // early-growth boost — pinned to the top of the feed
  createdAt: Date;
}

const PAGE_SIZE = 15;

// ── Early-growth boost ──────────────────────────────────────────────────────
// While the platform is young, every newly created discussion is pinned to the
// top of the feed for a window, so the first cohort actually sees fresh rooms.
// Once the user base passes the threshold, organic ranking takes over.
const BOOST_USER_THRESHOLD = 2000; // stop boosting after ~2k users
const BOOST_HOURS = 48; // how long a new prompt stays pinned
const MAX_BOOSTED_ON_PAGE = 15; // cap the boosted block on page 1
const BOOST_ZSET = "cr:boost"; // member = promptId, score = expiry epoch-ms

@Injectable()
export class PromptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly search: SearchService,
  ) {}

  /**
   * The infinite feed. Keyset pagination on (createdAt, id) for "new";
   * "hot" ranks by trendScore and is capped to the first pages (it's a
   * discovery surface, not an archive). First page cached 30 s per
   * (sort, category) — absorbs the stampede on the landing page.
   */
  async feed(query: FeedQueryDto, profileId?: string): Promise<Paginated<PromptCard>> {
    const personalized = !!profileId;
    const cacheKey = `cr:cache:feed:${query.sort}:${query.category ?? "all"}`;
    // Personalized feeds are per-user — never served from the shared cache.
    if (!query.cursor && !personalized) {
      const hit = await this.redis.getJSON<Paginated<PromptCard>>(cacheKey);
      if (hit) return hit;
    }

    const cursor = decodeCursor(query.cursor);

    // Currently-boosted prompt ids (early-growth pin). Shown as a block on
    // page 1 and excluded from the normal stream so they never appear twice.
    const boostedIds = await this.currentlyBoostedIds(query.category);

    // "For You": on page 1, pull recent prompts from the user's preferred
    // categories (favorites + rooms they've joined) into a personalized block.
    let personalizedIds: string[] = [];
    if (personalized && !cursor) {
      const prefCats = await this.preferredCategoryIds(profileId!);
      if (prefCats.length) {
        const pref = await this.prisma.prompt.findMany({
          where: {
            visibility: "PUBLIC",
            chatroom: { status: "ACTIVE" },
            categoryId: { in: prefCats },
            id: { notIn: boostedIds },
            ...(query.category && { category: { slug: query.category } }),
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 9,
          select: { id: true },
        });
        personalizedIds = pref.map((p) => p.id);
      }
    }

    const excludeIds = [...boostedIds, ...personalizedIds];
    const where: Prisma.PromptWhereInput = {
      visibility: "PUBLIC",
      chatroom: { status: "ACTIVE" },
      ...(query.category && { category: { slug: query.category } }),
      ...(excludeIds.length && { id: { notIn: excludeIds } }),
      ...(cursor && {
        OR: [
          { createdAt: { lt: cursor.ts } },
          { createdAt: cursor.ts, id: { lt: cursor.id } },
        ],
      }),
    };

    const rows = await this.prisma.prompt.findMany({
      where,
      orderBy:
        query.sort === "hot" && !cursor
          ? [{ trendScore: "desc" }, { createdAt: "desc" }, { id: "desc" }]
          : [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      include: {
        category: { select: { slug: true, name: true, icon: true } },
        creator: { select: { id: true, username: true, avatarUrl: true, reputation: true } },
        chatroom: { select: { id: true } },
      },
    });

    const page = toPage(rows, PAGE_SIZE, (r) => ({ createdAt: r.createdAt, id: r.id }));
    let items = await this.hydrateCards(page.items);

    // Page-1 blocks: boosted first, then personalized "for you" picks.
    if (!query.cursor) {
      const boostedCards = await this.cardsByIds(boostedIds, true);
      const personalizedCards = await this.cardsByIds(personalizedIds);
      items = [...boostedCards, ...personalizedCards, ...items];
    }

    const result = { items, nextCursor: page.nextCursor };
    if (!query.cursor && !personalized) await this.redis.setJSON(cacheKey, result, 30);
    return result;
  }

  /**
   * Trending prompts — the ones with the most traffic. trendScore accumulates
   * message activity (kept current by CountersService) and decays over time,
   * so this surfaces what's busy *now*, not all-time. Cached 30 s.
   */
  async trending(limit = 9): Promise<PromptCard[]> {
    const cacheKey = `cr:cache:trending:${limit}`;
    const hit = await this.redis.getJSON<PromptCard[]>(cacheKey);
    if (hit) return hit;

    const rows = await this.prisma.prompt.findMany({
      where: { visibility: "PUBLIC", chatroom: { status: "ACTIVE" } },
      orderBy: [
        { trendScore: "desc" },
        { messageCount: "desc" },
        { createdAt: "desc" },
      ],
      take: limit,
      include: {
        category: { select: { slug: true, name: true, icon: true } },
        creator: { select: { id: true, username: true, avatarUrl: true, reputation: true } },
        chatroom: { select: { id: true } },
      },
    });
    const cards = await this.hydrateCards(rows);
    await this.redis.setJSON(cacheKey, cards, 30);
    return cards;
  }

  async byId(id: string): Promise<PromptCard> {
    const p = await this.prisma.prompt.findUnique({
      where: { id },
      include: {
        category: { select: { slug: true, name: true, icon: true } },
        creator: { select: { id: true, username: true, avatarUrl: true, reputation: true } },
        chatroom: { select: { id: true } },
      },
    });
    if (!p) throw new NotFoundException({ code: "PROMPT_NOT_FOUND", message: "Prompt not found." });
    const [card] = await this.hydrateCards([p]);
    return card;
  }

  /** Creates prompt + its chatroom atomically; creator gets the OWNER seat. */
  async create(profileId: string, dto: CreatePromptDto): Promise<PromptCard> {
    const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
    if (!category) {
      throw new NotFoundException({ code: "CATEGORY_NOT_FOUND", message: "Unknown category." });
    }

    const prompt = await this.prisma.$transaction(async (tx) => {
      const created = await tx.prompt.create({
        data: {
          title: dto.title,
          description: dto.description,
          tags: dto.tags,
          maxUsers: dto.maxUsers,
          visibility: dto.visibility,
          categoryId: dto.categoryId,
          creatorId: profileId,
          chatroom: { create: { type: RoomType.PROMPT, capacity: dto.maxUsers } },
        },
        include: {
          category: { select: { slug: true, name: true, icon: true } },
          creator: { select: { id: true, username: true, avatarUrl: true, reputation: true } },
          chatroom: { select: { id: true } },
        },
      });
      await tx.participant.create({
        data: { chatroomId: created.chatroom!.id, profileId, role: "OWNER" },
      });
      await tx.anonymousProfile.update({
        where: { id: profileId },
        data: { roomsCreated: { increment: 1 } },
      });
      return created;
    });

    // Seat the creator in Redis and bust the first-page feed caches so the
    // new prompt shows up immediately.
    await this.redis.tryJoinRoom(prompt.chatroom!.id, profileId, prompt.maxUsers);
    // Make it findable (fire-and-forget; reindex self-heals any misses).
    this.search.indexPrompt({
      id: prompt.id,
      title: prompt.title,
      description: prompt.description,
      tags: prompt.tags,
      categorySlug: prompt.category.slug,
      categoryName: prompt.category.name,
      chatroomId: prompt.chatroom!.id,
      visibility: prompt.visibility,
      createdAt: prompt.createdAt,
    });
    // Early-growth boost: pin this new discussion to the top of the feed for
    // BOOST_HOURS, but only while the platform is still small.
    let boosted = false;
    if (await this.isEarlyPhase()) {
      const expiry = Date.now() + BOOST_HOURS * 3_600_000;
      await this.redis.client.zadd(BOOST_ZSET, expiry, prompt.id);
      boosted = true;
    }

    // Bust every first-page feed cache (new + hot, all categories) so the
    // boosted prompt shows immediately.
    const keys = await this.redis.client.keys("cr:cache:feed:*");
    if (keys.length) await this.redis.client.del(...keys);

    const [card] = await this.hydrateCards([prompt], boosted);
    return card;
  }

  // ── Early-growth boost helpers ──────────────────────────────────────────

  /**
   * True while the platform is under the user threshold. Cached 60 s so we
   * don't COUNT on every prompt view; once we're clearly past the threshold
   * the flag latches to false (the count only grows).
   */
  private async isEarlyPhase(): Promise<boolean> {
    const cached = await this.redis.client.get("cr:earlyphase");
    if (cached !== null) return cached === "1";
    const users = await this.prisma.anonymousProfile.count();
    const early = users < BOOST_USER_THRESHOLD;
    await this.redis.client.set("cr:earlyphase", early ? "1" : "0", "EX", 60);
    return early;
  }

  /**
   * Live boosted prompt ids (score = expiry). Prunes expired entries, returns
   * most-recently-boosted first, capped. Optionally filtered to a category so
   * a category feed only pins boosts from that category.
   */
  private async currentlyBoostedIds(categorySlug?: string): Promise<string[]> {
    const now = Date.now();
    await this.redis.client.zremrangebyscore(BOOST_ZSET, 0, now); // drop expired
    // Highest score (latest expiry ≈ most recently boosted) first.
    const ids = await this.redis.client.zrevrange(BOOST_ZSET, 0, MAX_BOOSTED_ON_PAGE - 1);
    if (!ids.length || !categorySlug) return ids;
    // Category feed: keep only boosts in that category.
    const inCat = await this.prisma.prompt.findMany({
      where: { id: { in: ids }, category: { slug: categorySlug } },
      select: { id: true },
    });
    const allowed = new Set(inCat.map((p) => p.id));
    return ids.filter((id) => allowed.has(id));
  }

  /** Toggle bookmark; returns new state. */
  async toggleBookmark(profileId: string, promptId: string): Promise<{ bookmarked: boolean }> {
    const existing = await this.prisma.bookmark.findUnique({
      where: { profileId_promptId: { profileId, promptId } },
    });
    if (existing) {
      await this.prisma.bookmark.delete({ where: { id: existing.id } });
      return { bookmarked: false };
    }
    await this.prisma.bookmark.create({ data: { profileId, promptId } });
    return { bookmarked: true };
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /** Fetch prompt cards for a set of ids, preserving the given order. */
  private async cardsByIds(ids: string[], boosted = false): Promise<PromptCard[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.prompt.findMany({
      where: { id: { in: ids }, visibility: "PUBLIC", chatroom: { status: "ACTIVE" } },
      include: {
        category: { select: { slug: true, name: true, icon: true } },
        creator: { select: { id: true, username: true, avatarUrl: true, reputation: true } },
        chatroom: { select: { id: true } },
      },
    });
    const order = new Map(ids.map((id, i) => [id, i]));
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return this.hydrateCards(rows, boosted);
  }

  /**
   * Categories the user has signalled interest in — favorited topics plus the
   * categories of rooms they've joined. Drives the "For You" personalization.
   */
  private async preferredCategoryIds(profileId: string): Promise<string[]> {
    const [favs, joined] = await Promise.all([
      this.prisma.favorite.findMany({
        where: { profileId },
        select: { topic: { select: { categoryId: true } } },
      }),
      this.prisma.participant.findMany({
        where: { profileId },
        take: 50,
        orderBy: { joinedAt: "desc" },
        select: {
          chatroom: {
            select: {
              prompt: { select: { categoryId: true } },
              topic: { select: { categoryId: true } },
            },
          },
        },
      }),
    ]);
    const ids = new Set<string>();
    for (const f of favs) if (f.topic) ids.add(f.topic.categoryId);
    for (const p of joined) {
      const cat = p.chatroom.prompt?.categoryId ?? p.chatroom.topic?.categoryId;
      if (cat) ids.add(cat);
    }
    return [...ids];
  }

  /** Merge live Redis presence counts into DB rows (one pipeline, no N+1). */
  private async hydrateCards(
    rows: Array<
      Prisma.PromptGetPayload<{
        include: {
          category: { select: { slug: true; name: true; icon: true } };
          creator: { select: { id: true; username: true; avatarUrl: true; reputation: true } };
          chatroom: { select: { id: true } };
        };
      }>
    >,
    boosted = false,
  ): Promise<PromptCard[]> {
    const pipeline = this.redis.client.pipeline();
    for (const r of rows) pipeline.scard(this.redis.roomKeys(r.chatroom!.id).members);
    const counts = (await pipeline.exec()) ?? [];

    return rows.map((r, i) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      tags: r.tags,
      category: r.category,
      creator: r.creator,
      chatroomId: r.chatroom!.id,
      visibility: r.visibility as Visibility,
      maxUsers: r.maxUsers,
      onlineCount: Number(counts[i]?.[1] ?? 0),
      messageCount: r.messageCount,
      boosted,
      createdAt: r.createdAt,
    }));
  }
}
