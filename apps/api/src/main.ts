import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import compression from "compression";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { GlobalExceptionFilter } from "./common/filters/http-exception.filter";
import { RedisIoAdapter } from "./infra/redis/redis-io.adapter";
import { RedisService } from "./infra/redis/redis.service";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  // If WEB_URL isn't set, reflect the request origin (`true`) so the API can
  // still boot and serve — used in the same-origin proxied topology where CORS
  // isn't the security boundary anyway.
  const webUrl = config.get<string>("WEB_URL");
  const corsOrigin: string | boolean = webUrl ?? true;

  // Behind Nginx/ALB — trust X-Forwarded-* so rate limiting and logs see
  // real client IPs.
  app.set("trust proxy", 1);

  // Security headers. CSP is owned by the Next.js app (it serves HTML);
  // the API returns JSON only.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());
  app.use(cookieParser());

  // Strict CORS: only the web origin, with credentials for the httpOnly
  // refresh-token cookie. CSRF posture: access tokens travel in the
  // Authorization header (not cookies) so state-changing routes aren't
  // cookie-authenticated; the sole cookie-authed route (/auth/refresh) is
  // protected by SameSite=strict + this origin allowlist.
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  });

  app.setGlobalPrefix("api/v1", { exclude: ["health/live", "health/ready"] });
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Socket.IO through the Redis adapter — realtime events reach every pod.
  app.useWebSocketAdapter(new RedisIoAdapter(app, app.get(RedisService), corsOrigin));

  // Let k8s finish in-flight requests on SIGTERM before the pod dies.
  app.enableShutdownHooks();

  // Hosts like Render/Railway assign a $PORT; fall back to API_PORT locally.
  // Bind 0.0.0.0 so the platform's load balancer can reach the container.
  const port = config.get<number>("PORT") ?? config.getOrThrow<number>("API_PORT");
  await app.listen(port, "0.0.0.0");
  new Logger("Bootstrap").log(`API listening on :${port} (env: ${config.get("NODE_ENV")})`);
}

void bootstrap();
