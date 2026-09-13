import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { CurrentUser, Public, type AuthUser } from "@/common/decorators";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { UsersService } from "./users.service";

const updateProfileSchema = z.object({
  bio: z.string().trim().max(280).optional(),
  avatarUrl: z.string().url().max(500).optional(),
});

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Public profile by anonymous username — never exposes the User row. */
  @Public()
  @Get("profiles/:username")
  async profile(@Param("username") username: string) {
    const profile = await this.users.publicProfile(username);
    if (!profile) {
      throw new NotFoundException({ code: "PROFILE_NOT_FOUND", message: "No such user." });
    }
    return profile;
  }

  @Get("me/profile")
  myProfile(@CurrentUser() user: AuthUser) {
    return this.users.ownProfile(user.profileId!);
  }

  @Patch("me/profile")
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: z.infer<typeof updateProfileSchema>,
  ) {
    return this.users.updateProfile(user.profileId!, body);
  }

  @Get("me/bookmarks")
  bookmarks(@CurrentUser() user: AuthUser, @Query("cursor") cursor?: string) {
    return this.users.bookmarks(user.profileId!, cursor);
  }

  @Get("me/rooms")
  rooms(@CurrentUser() user: AuthUser) {
    return this.users.activeRooms(user.profileId!);
  }
}
