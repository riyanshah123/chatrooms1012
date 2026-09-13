import { INestApplication } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { ServerOptions } from "socket.io";
import { RedisService } from "./redis.service";

/**
 * Socket.IO server adapter backed by Redis pub/sub. This is what makes the
 * realtime layer horizontally scalable: an emit to room X on pod A is
 * published through Redis and delivered to sockets connected to pods B/C.
 * Without it, users in the same chatroom would only see each other if they
 * happened to hit the same pod.
 */
export class RedisIoAdapter extends IoAdapter {
  constructor(
    app: INestApplication,
    private readonly redis: RedisService,
    private readonly corsOrigin: string | boolean,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.corsOrigin, credentials: true },
      // WebSocket-first; polling kept as fallback for restrictive networks
      // (polling requires LB sticky sessions — see infra/nginx).
      transports: ["websocket", "polling"],
    });
    server.adapter(createAdapter(this.redis.pubClient, this.redis.subClient));
    return server;
  }
}
