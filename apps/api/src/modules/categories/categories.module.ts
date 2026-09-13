import { Controller, Get, Module } from "@nestjs/common";
import { Public } from "@/common/decorators";
import { PrismaService } from "@/infra/prisma/prisma.service";
import { RedisService } from "@/infra/redis/redis.service";

/**
 * Categories are a tiny, near-static list — controller + 5-minute cache in
 * one file; a separate service/repository would be ceremony.
 */
@Controller("categories")
class CategoriesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  async list() {
    const cached = await this.redis.getJSON<unknown[]>("cr:cache:categories");
    if (cached) return { items: cached };

    const items = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, slug: true, name: true, icon: true },
    });
    await this.redis.setJSON("cr:cache:categories", items, 300);
    return { items };
  }
}

@Module({ controllers: [CategoriesController] })
export class CategoriesModule {}
