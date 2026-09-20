import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { REACTION_EMOJIS } from "@chatrooms/contracts";
import { CurrentUser, RequireVerified, type AuthUser } from "@/common/decorators";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { MessagesService } from "./messages.service";

export const sendMessageSchema = z.object({
  type: z.enum(["TEXT", "GIF"]).default("TEXT"),
  content: z.string().max(2000).default(""),
  gifUrl: z.string().url().optional(),
  replyToId: z.string().cuid().optional(),
  clientNonce: z.string().max(64).optional(),
});
const editSchema = z.object({ content: z.string().min(1).max(2000) });
const reactSchema = z.object({ emoji: z.enum(REACTION_EMOJIS) });
const pinSchema = z.object({ pinned: z.boolean() });
const readSchema = z.object({ messageId: z.string().cuid() });

/**
 * Message REST surface, nested under the room. The socket path (Step 13)
 * calls the same MessagesService — REST exists for history pagination and
 * as a degraded-network fallback for sending.
 */
@Controller("chatrooms/:roomId/messages")
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  history(
    @CurrentUser() user: AuthUser,
    @Param("roomId") roomId: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.messages.history(roomId, user.profileId!, cursor);
  }

  @RequireVerified()
  @Post()
  send(
    @CurrentUser() user: AuthUser,
    @Param("roomId") roomId: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: z.infer<typeof sendMessageSchema>,
  ) {
    return this.messages.create(roomId, user.profileId!, body);
  }

  @Patch(":messageId")
  edit(
    @CurrentUser() user: AuthUser,
    @Param("roomId") roomId: string,
    @Param("messageId") messageId: string,
    @Body(new ZodValidationPipe(editSchema)) body: z.infer<typeof editSchema>,
  ) {
    return this.messages.edit(roomId, user.profileId!, messageId, body.content);
  }

  @Delete(":messageId")
  remove(
    @CurrentUser() user: AuthUser,
    @Param("roomId") roomId: string,
    @Param("messageId") messageId: string,
  ) {
    return this.messages.delete(roomId, user.profileId!, messageId);
  }

  @Post(":messageId/reactions")
  react(
    @CurrentUser() user: AuthUser,
    @Param("roomId") roomId: string,
    @Param("messageId") messageId: string,
    @Body(new ZodValidationPipe(reactSchema)) body: z.infer<typeof reactSchema>,
  ) {
    return this.messages.toggleReaction(roomId, user.profileId!, messageId, body.emoji);
  }

  @Post(":messageId/pin")
  pin(
    @CurrentUser() user: AuthUser,
    @Param("roomId") roomId: string,
    @Param("messageId") messageId: string,
    @Body(new ZodValidationPipe(pinSchema)) body: z.infer<typeof pinSchema>,
  ) {
    return this.messages.setPinned(roomId, user.profileId!, messageId, body.pinned);
  }

  @Post("read")
  markRead(
    @CurrentUser() user: AuthUser,
    @Param("roomId") roomId: string,
    @Body(new ZodValidationPipe(readSchema)) body: z.infer<typeof readSchema>,
  ) {
    return this.messages.markRead(roomId, user.profileId!, body.messageId);
  }
}
