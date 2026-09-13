import { Module } from "@nestjs/common";
import { MessagesController } from "./messages.controller";
import { MessagesService } from "./messages.service";

@Module({
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService], // the chat gateway (Step 13) reuses it
})
export class MessagesModule {}
