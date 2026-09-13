import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { CurrentUser, Public, type AuthUser } from "@/common/decorators";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { ChatroomsService } from "./chatrooms.service";

const kickSchema = z.object({
  profileId: z.string().cuid(),
  reason: z.string().max(280).optional(),
});
const muteSchema = kickSchema.extend({
  minutes: z.number().int().min(1).max(1440).default(10),
});

/** All routes require auth — you must be logged in to even view a room. */
@Controller("chatrooms")
export class ChatroomsController {
  constructor(private readonly rooms: ChatroomsService) {}

  /** Public preview for the prompt detail page — no auth required. */
  @Public()
  @Get(":id/public")
  getPublic(@Param("id") id: string) {
    return this.rooms.getPublicRoom(id);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.rooms.getRoom(id, user.profileId!);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(":id/join")
  join(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.rooms.join(id, user.profileId!);
  }

  @Post(":id/leave")
  leave(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.rooms.leave(id, user.profileId!);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(":id/queue")
  enqueue(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.rooms.enqueue(id, user.profileId!);
  }

  @Delete(":id/queue")
  cancelQueue(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.rooms.cancelQueue(id, user.profileId!);
  }

  // ── Room moderation (owner / room moderator / staff) ──────────────────

  @Post(":id/kick")
  kick(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(kickSchema)) body: z.infer<typeof kickSchema>,
  ) {
    return this.rooms.kick(id, user.profileId!, body.profileId, body.reason);
  }

  @Post(":id/mute")
  mute(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(muteSchema)) body: z.infer<typeof muteSchema>,
  ) {
    return this.rooms.mute(id, user.profileId!, body.profileId, body.minutes, body.reason);
  }
}
