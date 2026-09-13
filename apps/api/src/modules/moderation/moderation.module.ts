import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { CurrentUser, Roles, type AuthUser } from "@/common/decorators";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { decodeCursor, toPage } from "@/common/utils/cursor";
import { PrismaService } from "@/infra/prisma/prisma.service";

const reportSchema = z.object({
  targetType: z.enum(["MESSAGE", "PROFILE", "PROMPT"]),
  messageId: z.string().cuid().optional(),
  targetProfileId: z.string().cuid().optional(),
  promptId: z.string().cuid().optional(),
  reason: z.enum([
    "SPAM", "HARASSMENT", "HATE_SPEECH", "VIOLENCE", "SEXUAL_CONTENT",
    "MISINFORMATION", "DOXXING", "OTHER",
  ]),
  details: z.string().max(1000).optional(),
});

const resolveSchema = z.object({
  status: z.enum(["REVIEWING", "RESOLVED", "DISMISSED"]),
  resolution: z.string().max(1000).optional(),
});

/** User-facing reporting. */
@Controller("reports")
class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(reportSchema)) body: z.infer<typeof reportSchema>,
  ) {
    // Denormalize the offender's profile for MESSAGE reports so the admin
    // dashboard can surface repeat offenders without joins.
    let targetProfileId = body.targetProfileId ?? null;
    if (body.targetType === "MESSAGE" && body.messageId) {
      const msg = await this.prisma.message.findUnique({
        where: { id: body.messageId },
        select: { authorId: true },
      });
      targetProfileId = msg?.authorId ?? null;
    }
    const report = await this.prisma.report.create({
      data: {
        reporterId: user.profileId!,
        targetType: body.targetType,
        messageId: body.messageId,
        promptId: body.promptId,
        targetProfileId,
        reason: body.reason,
        details: body.details,
      },
      select: { id: true },
    });
    return { id: report.id, status: "PENDING" };
  }
}

/** Admin dashboard API — staff only (RolesGuard). */
@Roles("ADMIN", "MODERATOR")
@Controller("admin/reports")
class AdminReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query("status") status = "PENDING",
    @Query("cursor") cursorRaw?: string,
  ) {
    const cursor = decodeCursor(cursorRaw);
    const rows = await this.prisma.report.findMany({
      where: {
        status: status as never,
        ...(cursor && {
          OR: [
            { createdAt: { lt: cursor.ts } },
            { createdAt: cursor.ts, id: { lt: cursor.id } },
          ],
        }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 26,
      include: {
        reporter: { select: { username: true } },
        targetProfile: { select: { id: true, username: true } },
        message: { select: { id: true, content: true, chatroomId: true } },
        prompt: { select: { id: true, title: true } },
      },
    });
    return toPage(rows, 25, (r) => ({ createdAt: r.createdAt, id: r.id }));
  }

  @Patch(":id")
  async resolve(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(resolveSchema)) body: z.infer<typeof resolveSchema>,
  ) {
    await this.prisma.report.update({
      where: { id },
      data: {
        status: body.status,
        resolution: body.resolution,
        resolvedById: user.userId, // admin's real User id, deliberately
        ...(body.status !== "REVIEWING" && { resolvedAt: new Date() }),
      },
    });
    return { ok: true };
  }
}

@Module({ controllers: [ReportsController, AdminReportsController] })
export class ModerationModule {}
