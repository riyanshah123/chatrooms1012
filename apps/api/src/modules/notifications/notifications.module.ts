import { Controller, Get, Module, Param, Post, Query } from "@nestjs/common";
import { CurrentUser, type AuthUser } from "@/common/decorators";
import { decodeCursor, toPage } from "@/common/utils/cursor";
import { PrismaService } from "@/infra/prisma/prisma.service";

const PAGE_SIZE = 20;

@Controller("notifications")
class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query("cursor") cursorRaw?: string) {
    const cursor = decodeCursor(cursorRaw);
    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: {
          profileId: user.profileId!,
          ...(cursor && {
            OR: [
              { createdAt: { lt: cursor.ts } },
              { createdAt: cursor.ts, id: { lt: cursor.id } },
            ],
          }),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: PAGE_SIZE + 1,
      }),
      this.prisma.notification.count({
        where: { profileId: user.profileId!, readAt: null },
      }),
    ]);
    const page = toPage(rows, PAGE_SIZE, (r) => ({ createdAt: r.createdAt, id: r.id }));
    return { ...page, unreadCount };
  }

  @Post(":id/read")
  async markRead(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.prisma.notification.updateMany({
      where: { id, profileId: user.profileId! }, // ownership check in the WHERE
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  @Post("read-all")
  async markAllRead(@CurrentUser() user: AuthUser) {
    await this.prisma.notification.updateMany({
      where: { profileId: user.profileId!, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}

@Module({ controllers: [NotificationsController] })
export class NotificationsModule {}
