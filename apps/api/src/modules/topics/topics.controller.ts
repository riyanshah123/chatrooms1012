import { Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CurrentUser, Public, type AuthUser } from "@/common/decorators";
import { TopicsService } from "./topics.service";

@Controller("topics")
export class TopicsController {
  constructor(private readonly topics: TopicsService) {}

  /** GET /topics?category=sports&cursor=... — browse, trending first. */
  @Public()
  @Get()
  list(@Query("category") category?: string, @Query("cursor") cursor?: string) {
    return this.topics.list({ category, cursor });
  }

  @Public()
  @Get(":slug")
  bySlug(@Param("slug") slug: string) {
    return this.topics.bySlug(slug);
  }

  /** POST /topics/:id/favorite — toggle. */
  @Post(":id/favorite")
  favorite(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.topics.toggleFavorite(user.profileId!, id);
  }
}
