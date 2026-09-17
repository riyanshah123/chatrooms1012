import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Single PrismaClient per process. Connection sizing note: in production the
 * DATABASE_URL points at PgBouncer (transaction mode) with a small per-pod
 * pool (`?connection_limit=10`) — total connections stay bounded as pods
 * scale horizontally.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      datasources: { db: { url: PrismaService.tunedUrl() } },
      log:
        process.env.NODE_ENV === "development"
          ? ["warn", "error"]
          : ["error"],
    });
  }

  /**
   * Pin the pool size and a generous acquire timeout unless the URL already
   * says otherwise. Prisma's default pool scales with CPU count, which on a
   * small shared instance is both too small under bursts and prone to
   * "timed out fetching a connection" errors. An explicit modest pool plus a
   * longer wait makes requests queue rather than fail.
   */
  private static tunedUrl(): string {
    const raw = process.env.DATABASE_URL;
    if (!raw) return raw as unknown as string;
    try {
      const url = new URL(raw);
      if (!url.searchParams.has("connection_limit")) {
        url.searchParams.set("connection_limit", "10");
      }
      if (!url.searchParams.has("pool_timeout")) {
        url.searchParams.set("pool_timeout", "20"); // seconds
      }
      return url.toString();
    } catch {
      return raw; // not a parseable URL, leave it alone
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
