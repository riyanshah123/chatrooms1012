import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MessagesModule } from "@/modules/messages/messages.module";
import { ChatEventsService } from "./chat-events.service";
import { ChatGateway } from "./chat.gateway";

/**
 * Global so any feature module can inject ChatEventsService to broadcast
 * (messages, chatrooms, queue, moderation) without importing the gateway.
 */
@Global()
@Module({
  imports: [JwtModule.register({}), MessagesModule],
  providers: [ChatGateway, ChatEventsService],
  exports: [ChatEventsService],
})
export class ChatGatewayModule {}
