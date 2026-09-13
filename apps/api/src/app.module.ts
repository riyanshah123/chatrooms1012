import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { validateEnv } from "@/common/config/env";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { RolesGuard } from "@/common/guards/roles.guard";
import { PrismaModule } from "@/infra/prisma/prisma.module";
import { RedisModule } from "@/infra/redis/redis.module";
import { SearchInfraModule } from "@/infra/search/search.module";
import { AuthModule } from "@/modules/auth/auth.module";
import { CategoriesModule } from "@/modules/categories/categories.module";
import { ChatGatewayModule } from "@/modules/chat-gateway/chat-gateway.module";
import { ChatroomsModule } from "@/modules/chatrooms/chatrooms.module";
import { HealthModule } from "@/modules/health/health.module";
import { MessagesModule } from "@/modules/messages/messages.module";
import { ModerationModule } from "@/modules/moderation/moderation.module";
import { NotificationsModule } from "@/modules/notifications/notifications.module";
import { PromptsModule } from "@/modules/prompts/prompts.module";
import { SearchModule } from "@/modules/search/search.module";
import { StatsModule } from "@/modules/stats/stats.module";
import { TopicsModule } from "@/modules/topics/topics.module";
import { UsersModule } from "@/modules/users/users.module";
import { WorkersModule } from "@/modules/workers/workers.module";

/**
 * Root module. Feature modules (auth, prompts, chatrooms, messages, gateway,
 * search, moderation, notifications) are added in Steps 5–14 — each is
 * self-contained under src/modules/* per the clean-architecture layout.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      // In k8s, env comes from the pod spec; .env is a dev convenience.
      envFilePath: ["../../.env", ".env"],
    }),

    // Global IP-based rate limit — coarse safety net under the per-user
    // Redis token bucket applied to hot endpoints (Step 7). Nginx adds a
    // third, outermost layer.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            limit: config.getOrThrow<number>("RATE_LIMIT_POINTS"),
            ttl: config.getOrThrow<number>("RATE_LIMIT_WINDOW") * 1000,
          },
        ],
      }),
    }),

    PrismaModule,
    RedisModule,
    SearchInfraModule,
    AuthModule,
    ChatGatewayModule,
    CategoriesModule,
    TopicsModule,
    PromptsModule,
    ChatroomsModule,
    MessagesModule,
    UsersModule,
    NotificationsModule,
    ModerationModule,
    SearchModule,
    StatsModule,
    WorkersModule,
    HealthModule,
  ],
  providers: [
    // Order matters: throttle first (cheap), then authenticate, then roles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
