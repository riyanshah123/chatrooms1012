import { Module } from "@nestjs/common";
import { ChatroomsModule } from "@/modules/chatrooms/chatrooms.module";
import { CountersService } from "./counters.service";
import { DailyPromptsService } from "./daily-prompts.service";
import { SweeperService } from "./sweeper.service";
import { TrendsService } from "./trends.service";

/**
 * In-process background workers, safe under horizontal scaling via Redis
 * NX locks (one pod does the work per tick, the rest no-op). To move to a
 * dedicated worker deployment later, run the API image with WORKERS_ONLY
 * and register only this module — the services don't touch HTTP.
 */
@Module({
  imports: [ChatroomsModule],
  providers: [SweeperService, CountersService, TrendsService, DailyPromptsService],
})
export class WorkersModule {}
