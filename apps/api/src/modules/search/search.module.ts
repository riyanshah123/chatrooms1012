import { Controller, Get, Logger, Module, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public, Roles } from "@/common/decorators";
import { RedisService } from "@/infra/redis/redis.service";
import { SearchService } from "@/infra/search/search.service";

type SearchResults = Awaited<ReturnType<SearchService["searchAll"]>>;
const EMPTY: SearchResults = { prompts: [], topics: [], users: [] };

@Controller()
class SearchController {
  private readonly logger = new Logger(SearchController.name);

  constructor(
    private readonly search: SearchService,
    private readonly redis: RedisService,
  ) {}

  /**
   * GET /search?q= — cross-entity search + typeahead (the UI debounces).
   * Hot queries ("marvel", "ai") repeat constantly across users, so results
   * are micro-cached 15 s — enough to shed most of the load without
   * noticeably stale suggestions.
   */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get("search")
  async query(@Query("q") q?: string) {
    const term = (q ?? "").trim().slice(0, 80);
    if (term.length < 2) return EMPTY;

    const cacheKey = `cr:cache:search:${term.toLowerCase()}`;
    const hit = await this.redis.getJSON<SearchResults>(cacheKey);
    if (hit) return hit;

    // Prefer OpenSearch (typeahead-ranked); if it's unavailable or errors,
    // fall back to a Postgres query so search never goes dark.
    let results: SearchResults;
    try {
      results = await this.search.searchAll(term);
    } catch (e) {
      this.logger.warn(`OpenSearch unavailable, using Postgres fallback: ${(e as Error).message}`);
      results = await this.search.searchPostgres(term);
    }
    await this.redis.setJSON(cacheKey, results, 15);
    return results;
  }

  /** Backfill/repair — run once after seeding, or if indexes drift. */
  @Roles("ADMIN")
  @Post("admin/search/reindex")
  reindex() {
    return this.search.reindexAll();
  }
}

@Module({ controllers: [SearchController] })
export class SearchModule {}
