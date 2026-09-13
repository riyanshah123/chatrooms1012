import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { Public } from "@/common/decorators";
import { PrismaService } from "@/infra/prisma/prisma.service";
import { RedisService } from "@/infra/redis/redis.service";

/**
 * Kubernetes probes.
 *  liveness  → /health/live   process is up (no dependency checks — a flaky
 *              dependency must not restart-loop the pods)
 *  readiness → /health/ready  pod can serve traffic (DB + Redis reachable);
 *              failing readiness removes the pod from the LB, no restart
 */
@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Public()
  @Get("ready")
  async ready() {
    try {
      await Promise.all([
        this.prisma.$queryRaw`SELECT 1`,
        this.redis.client.ping(),
      ]);
      return { status: "ok" };
    } catch {
      throw new ServiceUnavailableException({
        code: "NOT_READY",
        message: "Dependency unavailable",
      });
    }
  }
}
