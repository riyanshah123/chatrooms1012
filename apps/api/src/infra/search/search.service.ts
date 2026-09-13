import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client } from "@opensearch-project/opensearch";
import { PrismaService } from "@/infra/prisma/prisma.service";

/**
 * OpenSearch access. Three small indexes, one per searchable entity.
 * `search_as_you_type` fields power the suggest-while-typing UX with plain
 * bool_prefix multi_match queries — no separate completion suggester to
 * keep in sync.
 *
 * Consistency model: Postgres is the source of truth; documents are indexed
 * fire-and-forget on write (~eventually consistent within a second). A lost
 * index write self-heals on the next reindex; searches never block writes.
 */
@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  /** Null when OPENSEARCH_URL is unset — the search controller then uses the
   *  Postgres fallback. Lets minimal deploys run without OpenSearch. */
  readonly client: Client | null;

  static readonly IDX = {
    prompts: "cr-prompts",
    topics: "cr-topics",
    users: "cr-users",
  } as const;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const url = config.get<string>("OPENSEARCH_URL");
    this.client = url ? new Client({ node: url }) : null;
  }

  /** True when OpenSearch is configured; callers can skip straight to Postgres. */
  get enabled(): boolean {
    return this.client !== null;
  }

  async onModuleInit(): Promise<void> {
    if (!this.client) {
      this.logger.log("OpenSearch not configured — using Postgres search fallback.");
      return;
    }
    try {
      await this.ensureIndexes();
    } catch (e) {
      // Search being down must not block API boot — degrade gracefully.
      this.logger.error(`OpenSearch unavailable at boot: ${(e as Error).message}`);
    }
  }

  // ── Index bootstrap ────────────────────────────────────────────────────

  private async ensureIndexes(): Promise<void> {
    if (!this.client) return;
    const defs: Array<{ index: string; properties: Record<string, unknown> }> = [
      {
        index: SearchService.IDX.prompts,
        properties: {
          title: { type: "search_as_you_type" },
          description: { type: "text" },
          tags: { type: "keyword" },
          categorySlug: { type: "keyword" },
          categoryName: { type: "keyword" },
          chatroomId: { type: "keyword" },
          visibility: { type: "keyword" },
          createdAt: { type: "date" },
        },
      },
      {
        index: SearchService.IDX.topics,
        properties: {
          title: { type: "search_as_you_type" },
          slug: { type: "keyword" },
          categorySlug: { type: "keyword" },
          chatroomId: { type: "keyword" },
          trendScore: { type: "float" },
        },
      },
      {
        index: SearchService.IDX.users,
        properties: {
          username: { type: "search_as_you_type" },
          avatarUrl: { type: "keyword", index: false },
          reputation: { type: "integer" },
        },
      },
    ];

    for (const def of defs) {
      const exists = await this.client.indices.exists({ index: def.index });
      if (!exists.body) {
        await this.client.indices.create({
          index: def.index,
          body: {
            settings: { number_of_shards: 1, number_of_replicas: 1 },
            mappings: { properties: def.properties },
          },
        });
        this.logger.log(`Created index ${def.index}`);
      }
    }
  }

  // ── Write path (fire-and-forget; callers don't await) ──────────────────

  indexPrompt(p: {
    id: string;
    title: string;
    description: string | null;
    tags: string[];
    categorySlug: string;
    categoryName: string;
    chatroomId: string;
    visibility: string;
    createdAt: Date;
  }): void {
    if (!this.client) return;
    void this.client
      .index({ index: SearchService.IDX.prompts, id: p.id, body: p })
      .catch((e) => this.logger.warn(`indexPrompt failed: ${e.message}`));
  }

  indexTopic(t: {
    id: string;
    title: string;
    slug: string;
    categorySlug: string;
    chatroomId: string;
    trendScore: number;
  }): void {
    if (!this.client) return;
    void this.client
      .index({ index: SearchService.IDX.topics, id: t.id, body: t })
      .catch((e) => this.logger.warn(`indexTopic failed: ${e.message}`));
  }

  indexUser(u: { id: string; username: string; avatarUrl: string | null; reputation: number }): void {
    if (!this.client) return;
    void this.client
      .index({ index: SearchService.IDX.users, id: u.id, body: u })
      .catch((e) => this.logger.warn(`indexUser failed: ${e.message}`));
  }

  removePrompt(id: string): void {
    if (!this.client) return;
    void this.client
      .delete({ index: SearchService.IDX.prompts, id })
      .catch(() => undefined);
  }

  // ── Query path ─────────────────────────────────────────────────────────

  /**
   * Cross-entity search for the suggest dropdown + search page. One msearch
   * round trip; bool_prefix matches the search_as_you_type subfields so
   * partial words ("harry po") already rank correctly.
   */
  async searchAll(q: string): Promise<{
    prompts: Array<{ id: string; title: string; chatroomId: string; categoryName: string }>;
    topics: Array<{ id: string; title: string; slug: string; chatroomId: string }>;
    users: Array<{ username: string; avatarUrl: string | null }>;
  }> {
    if (!this.client) throw new Error("OpenSearch not configured");
    const sayt = (field: string) => ({
      multi_match: {
        query: q,
        type: "bool_prefix" as const,
        fields: [field, `${field}._2gram`, `${field}._3gram`],
      },
    });

    const { body } = await this.client.msearch({
      body: [
        { index: SearchService.IDX.prompts },
        {
          size: 8,
          query: {
            bool: {
              must: [
                {
                  bool: {
                    should: [sayt("title"), { term: { tags: q.toLowerCase() } }],
                  },
                },
              ],
              filter: [{ term: { visibility: "PUBLIC" } }],
            },
          },
        },
        { index: SearchService.IDX.topics },
        { size: 5, query: sayt("title") },
        { index: SearchService.IDX.users },
        { size: 5, query: sayt("username") },
      ],
    });

    type Hit<T> = { _id: string; _source: T };
    const [prompts, topics, users] = (body.responses as Array<{
      hits?: { hits: Hit<Record<string, unknown>>[] };
      error?: unknown;
    }>).map((r) => r.hits?.hits ?? []);

    return {
      prompts: prompts.map((h) => ({
        id: h._id,
        title: String(h._source.title),
        chatroomId: String(h._source.chatroomId),
        categoryName: String(h._source.categoryName ?? ""),
      })),
      topics: topics.map((h) => ({
        id: h._id,
        title: String(h._source.title),
        slug: String(h._source.slug),
        chatroomId: String(h._source.chatroomId),
      })),
      users: users.map((h) => ({
        username: String(h._source.username),
        avatarUrl: (h._source.avatarUrl as string | null) ?? null,
      })),
    };
  }

  /**
   * Postgres fallback search — used when OpenSearch is unavailable (e.g. not
   * running in local dev) so the search box always works. Case-insensitive
   * title/username matching + exact tag match; ranked by trend for prompts.
   * Same result shape as searchAll.
   */
  async searchPostgres(q: string): Promise<{
    prompts: Array<{ id: string; title: string; chatroomId: string; categoryName: string }>;
    topics: Array<{ id: string; title: string; slug: string; chatroomId: string }>;
    users: Array<{ username: string; avatarUrl: string | null }>;
  }> {
    const [prompts, topics, users] = await Promise.all([
      this.prisma.prompt.findMany({
        where: {
          visibility: "PUBLIC",
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { tags: { has: q.toLowerCase() } },
          ],
        },
        orderBy: { trendScore: "desc" },
        take: 8,
        include: {
          category: { select: { name: true } },
          chatroom: { select: { id: true } },
        },
      }),
      this.prisma.topic.findMany({
        where: { title: { contains: q, mode: "insensitive" } },
        take: 5,
        include: { chatroom: { select: { id: true } } },
      }),
      this.prisma.anonymousProfile.findMany({
        where: { username: { contains: q, mode: "insensitive" } },
        take: 5,
        select: { username: true, avatarUrl: true },
      }),
    ]);

    return {
      prompts: prompts.map((p) => ({
        id: p.id,
        title: p.title,
        chatroomId: p.chatroom?.id ?? "",
        categoryName: p.category.name,
      })),
      topics: topics.map((t) => ({
        id: t.id,
        title: t.title,
        slug: t.slug,
        chatroomId: t.chatroom?.id ?? "",
      })),
      users: users.map((u) => ({ username: u.username, avatarUrl: u.avatarUrl })),
    };
  }

  // ── Full reindex (bootstrap / repair) ──────────────────────────────────

  async reindexAll(): Promise<{ prompts: number; topics: number; users: number }> {
    if (!this.client) return { prompts: 0, topics: 0, users: 0 };
    await this.ensureIndexes();

    const [prompts, topics, users] = await Promise.all([
      this.prisma.prompt.findMany({
        include: { category: true, chatroom: { select: { id: true } } },
      }),
      this.prisma.topic.findMany({
        include: { category: true, chatroom: { select: { id: true } } },
      }),
      this.prisma.anonymousProfile.findMany(),
    ]);

    const bulk: Record<string, unknown>[] = [];
    for (const p of prompts) {
      bulk.push({ index: { _index: SearchService.IDX.prompts, _id: p.id } });
      bulk.push({
        title: p.title,
        description: p.description,
        tags: p.tags,
        categorySlug: p.category.slug,
        categoryName: p.category.name,
        chatroomId: p.chatroom?.id ?? "",
        visibility: p.visibility,
        createdAt: p.createdAt,
      });
    }
    for (const t of topics) {
      bulk.push({ index: { _index: SearchService.IDX.topics, _id: t.id } });
      bulk.push({
        title: t.title,
        slug: t.slug,
        categorySlug: t.category.slug,
        chatroomId: t.chatroom?.id ?? "",
        trendScore: t.trendScore,
      });
    }
    for (const u of users) {
      bulk.push({ index: { _index: SearchService.IDX.users, _id: u.id } });
      bulk.push({ username: u.username, avatarUrl: u.avatarUrl, reputation: u.reputation });
    }

    if (bulk.length) await this.client.bulk({ body: bulk, refresh: true });
    return { prompts: prompts.length, topics: topics.length, users: users.length };
  }
}
