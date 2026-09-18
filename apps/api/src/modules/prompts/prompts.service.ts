import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, RoomType } from "@prisma/client";
import {
  SocketEvents,
  type Paginated,
  type PublicProfile,
  type RoomCreatedPayload,
  type Visibility,
} from "@chatrooms/contracts";
import { decodeCursor, toPage } from "@/common/utils/cursor";
import { PrismaService } from "@/infra/prisma/prisma.service";
import { RedisService } from "@/infra/redis/redis.service";
import { SearchService } from "@/infra/search/search.service";
import { ChatEventsService } from "@/modules/chat-gateway/chat-events.service";
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

/**
 * Stable per-(prompt, viewer) number. Same pair always yields the same value,
 * different viewers yield different orderings, so two accounts looking at the
 * same pool of prompts get genuinely different "For You" picks.
 */
function hashPair(a: string, b: string): number {
  let h = 2166136261;
  const s = `${a}:${b}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ── Early-growth boost ──────────────────────────────────────────────────────
// While the platform is young, every newly created discussion is pinned to the
// top of the feed for a window, so the first cohort actually sees fresh rooms.
// Once the user base passes the threshold, organic ranking takes over.
const BOOST_USER_THRESHOLD = 2000; // stop boosting after ~2k users
const BOOST_HOURS = 48; // how long a new prompt stays pinned
const MAX_BOOSTED_ON_PAGE = 15; // cap the boosted block on page 1
const BOOST_ZSET = "cr:boost"; // member = promptId, score = expiry epoch-ms

/** A freshly opened room stays at the top of Trending for this long. */
const TRENDING_FRESH_MS = 15 * 60_000;

@Injectable()
export class PromptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly search: SearchService,
    private readonly events: ChatEventsService,
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
    // Rooms that already have people in them but still have a free seat are
    // the best thing to show anyone: there's a conversation happening AND you
    // can get in. These float above everything except boosts.
    let liveIds: string[] = [];
    if (!cursor) {
      const chatroomIds = await this.redis.liveRoomIds(1, 9, 12);
      if (chatroomIds.length) {
        const live = await this.prisma.prompt.findMany({
          where: {
            visibility: "PUBLIC",
            chatroom: { status: "ACTIVE", id: { in: chatroomIds } },
            id: { notIn: boostedIds },
            ...(query.category && { category: { slug: query.category } }),
          },
          select: { id: true, chatroom: { select: { id: true } } },
        });
        // Preserve Redis ordering (busiest first).
        const rank = new Map(chatroomIds.map((id, i) => [id, i]));
        live.sort(
          (a, b) =>
            (rank.get(a.chatroom!.id) ?? 99) - (rank.get(b.chatroom!.id) ?? 99),
        );
        liveIds = live.map((p) => p.id);
      }
    }

    let personalizedIds: string[] = [];
    if (personalized && !cursor) {
      const taken = [...boostedIds, ...liveIds];
      const prefCats = await this.preferredCategoryIds(profileId!);
      if (prefCats.length) {
        const pref = await this.prisma.prompt.findMany({
          where: {
            visibility: "PUBLIC",
            chatroom: { status: "ACTIVE" },
            categoryId: { in: prefCats },
            id: { notIn: taken },
            ...(query.category && { category: { slug: query.category } }),
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 9,
          select: { id: true },
        });
        personalizedIds = pref.map((p) => p.id);
      } else {
        // No signals yet (new account). Still give this person their OWN feed:
        // take a recent window and order it by a hash of prompt+profile, so
        // every account gets a different but stable set of picks.
        const recent = await this.prisma.prompt.findMany({
          where: {
            visibility: "PUBLIC",
            chatroom: { status: "ACTIVE" },
            id: { notIn: taken },
            ...(query.category && { category: { slug: query.category } }),
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 120,
          select: { id: true },
        });
        personalizedIds = recent
          .map((p) => ({ id: p.id, k: hashPair(p.id, profileId!) }))
          .sort((a, b) => a.k - b.k)
          .slice(0, 9)
          .map((p) => p.id);
      }
    }

    const excludeIds = [...boostedIds, ...liveIds, ...personalizedIds];
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

    // Page-1 order: boosted, then live-and-joinable rooms, then this account's
    // own picks, then the normal stream.
    if (!query.cursor) {
      const boostedCards = await this.cardsByIds(boostedIds, true);
      const liveCards = await this.cardsByIds(liveIds);
      const personalizedCards = await this.cardsByIds(personalizedIds);
      items = [...boostedCards, ...liveCards, ...personalizedCards, ...items];
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
  async trending(limit = 12): Promise<PromptCard[]> {
    const cacheKey = `cr:cache:trending:${limit}`;
    const hit = await this.redis.getJSON<PromptCard[]>(cacheKey);
    if (hit) return hit;

    // Trending means "people want to talk about this right now", so it is
    // ordered by who is actually in the room:
    //   1. rooms opened in the last few minutes, newest first
    //   2. rooms with people in them, most people first
    //   3. rooms that are full, pushed to the bottom (you can't get in)
    const [liveIds, fullIds] = await Promise.all([
      this.redis.liveRoomIds(1, 9, 40),
      this.redis.fullRoomIds(10, 20),
    ]);

    const chatroomIds = [...liveIds, ...fullIds];
    let cards: PromptCard[] = [];
    if (chatroomIds.length) {
      const rows = await this.prisma.prompt.findMany({
        where: {
          visibility: "PUBLIC",
          chatroom: { status: "ACTIVE", id: { in: chatroomIds } },
        },
        include: {
          category: { select: { slug: true, name: true, icon: true } },
          creator: { select: { id: true, username: true, avatarUrl: true, reputation: true } },
          chatroom: { select: { id: true } },
        },
      });
      cards = await this.hydrateCards(rows);
    }

    const now = Date.now();
    const age = (c: PromptCard) => now - new Date(c.createdAt).getTime();
    const byPeopleThenNew = (a: PromptCard, b: PromptCard) =>
      b.onlineCount - a.onlineCount || age(a) - age(b);

    const full = cards.filter((c) => c.onlineCount >= c.maxUsers).sort(byPeopleThenNew);
    const occupied = cards.filter((c) => c.onlineCount > 0 && c.onlineCount < c.maxUsers);
    const justOpened = occupied
      .filter((c) => age(c) < TRENDING_FRESH_MS)
      .sort((a, b) => age(a) - age(b));
    const rest = occupied
      .filter((c) => age(c) >= TRENDING_FRESH_MS)
      .sort(byPeopleThenNew);

    let ordered = [...justOpened, ...rest, ...full];

    // Quiet platform: pad with the most talked-about rooms so the section is
    // never empty.
    if (ordered.length < limit) {
      const have = new Set(ordered.map((c) => c.id));
      const padRows = await this.prisma.prompt.findMany({
        where: {
          visibility: "PUBLIC",
          chatroom: { status: "ACTIVE" },
          ...(have.size && { id: { notIn: [...have] } }),
        },
        orderBy: [
          { trendScore: "desc" },
          { messageCount: "desc" },
          { createdAt: "desc" },
        ],
        take: limit - ordered.length,
        include: {
          category: { select: { slug: true, name: true, icon: true } },
          creator: { select: { id: true, username: true, avatarUrl: true, reputation: true } },
          chatroom: { select: { id: true } },
        },
      });
      ordered = [...ordered, ...(await this.hydrateCards(padRows))];
    }

    const result = ordered.slice(0, limit);
    // Short TTL: this reorders as people come and go.
    await this.redis.setJSON(cacheKey, result, 15);
    return result;
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
    // Tell everyone connected that a new room just opened.
    this.events.toEveryone(SocketEvents.ROOM_CREATED, {
      promptId: prompt.id,
      chatroomId: prompt.chatroom!.id,
      title: prompt.title,
      categoryName: prompt.category.name,
      creatorUsername: prompt.creator.username,
    } satisfies RoomCreatedPayload);

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
