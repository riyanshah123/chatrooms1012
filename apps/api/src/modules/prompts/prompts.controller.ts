import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser, Public, type AuthUser } from "@/common/decorators";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import {
  createPromptSchema,
  feedQuerySchema,
  type CreatePromptDto,
  type FeedQueryDto,
} from "./dto/prompt.schemas";
import { PromptsService } from "./prompts.service";

@Controller("prompts")
export class PromptsController {
  constructor(private readonly prompts: PromptsService) {}

  /** GET /prompts?sort=new|hot&category=...&cursor=... — the infinite feed. */
  @Public()
  @Get()
  feed(@Query(new ZodValidationPipe(feedQuerySchema)) query: FeedQueryDto) {
    return this.prompts.feed(query);
  }

  /** GET /prompts/trending — top prompts by traffic (literal route first). */
  @Public()
  @Get("trending")
  trending() {
    return this.prompts.trending(9).then((items) => ({ items }));
  }

  /**
   * GET /prompts/for-you — the personalized feed (auth required). Floats
   * prompts from the user's favorite/joined categories to the top of page 1,
   * then the normal recency stream.
   */
  @Get("for-you")
  forYou(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(feedQuerySchema)) query: FeedQueryDto,
  ) {
    return this.prompts.feed(query, user.profileId!);
  }

  @Public()
  @Get(":id")
  byId(@Param("id") id: string) {
    return this.prompts.byId(id);
  }

  /** Creation is throttled hard — prompt spam pollutes the whole feed. */
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createPromptSchema)) dto: CreatePromptDto,
  ) {
    return this.prompts.create(user.profileId!, dto);
  }

  @Post(":id/bookmark")
  bookmark(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.prompts.toggleBookmark(user.profileId!, id);
  }
}
