import { Injectable } from "@nestjs/common";
import { decodeCursor, toPage } from "@/common/utils/cursor";
import { PrismaService } from "@/infra/prisma/prisma.service";

const PAGE_SIZE = 20;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Everything a profile page shows — all derived from the anonymous side. */
  async publicProfile(username: string) {
    const p = await this.prisma.anonymousProfile.findUnique({
      where: { usernameLower: username.toLowerCase() },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        bio: true,
        reputation: true,
        roomsCreated: true,
        roomsJoined: true,
        createdAt: true,
        favorites: {
          take: 10,
          orderBy: { createdAt: "desc" },
          select: { topic: { select: { slug: true, title: true } } },
        },
      },
    });
    if (!p) return null;
    return { ...p, favorites: p.favorites.map((f) => f.topic) };
  }

  async ownProfile(profileId: string) {
    const p = await this.prisma.anonymousProfile.findUniqueOrThrow({
      where: { id: profileId },
      select: { username: true },
    });
    return this.publicProfile(p.username);
  }

  async updateProfile(profileId: string, data: { bio?: string; avatarUrl?: string }) {
    const updated = await this.prisma.anonymousProfile.update({
      where: { id: profileId },
      data,
      select: { id: true, username: true, avatarUrl: true, bio: true },
    });
    return updated;
  }

  async bookmarks(profileId: string, cursorRaw?: string) {
    const cursor = decodeCursor(cursorRaw);
    const rows = await this.prisma.bookmark.findMany({
      where: {
        profileId,
        ...(cursor && {
          OR: [
            { createdAt: { lt: cursor.ts } },
            { createdAt: cursor.ts, id: { lt: cursor.id } },
          ],
        }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      select: {
        id: true,
        createdAt: true,
        prompt: {
          select: {
            id: true,
            title: true,
            category: { select: { slug: true, name: true, icon: true } },
            chatroom: { select: { id: true } },
          },
        },
      },
    });
    const page = toPage(rows, PAGE_SIZE, (r) => ({ createdAt: r.createdAt, id: r.id }));
    return {
      items: page.items.map((b) => ({
        id: b.id,
        prompt: {
          id: b.prompt.id,
          title: b.prompt.title,
          category: b.prompt.category,
          chatroomId: b.prompt.chatroom!.id,
        },
        createdAt: b.createdAt,
      })),
      nextCursor: page.nextCursor,
    };
  }

  /** Rooms where the user currently holds a seat (for "My rooms" nav). */
  async activeRooms(profileId: string) {
    const rows = await this.prisma.participant.findMany({
      where: { profileId, leftAt: null },
      orderBy: { joinedAt: "desc" },
      take: 50,
      select: {
        joinedAt: true,
        chatroom: {
          select: {
            id: true,
            type: true,
            prompt: { select: { title: true } },
            topic: { select: { title: true } },
          },
        },
      },
    });
    return {
      items: rows.map((r) => ({
        roomId: r.chatroom.id,
        type: r.chatroom.type,
        title: r.chatroom.prompt?.title ?? r.chatroom.topic?.title ?? "Room",
        joinedAt: r.joinedAt,
      })),
    };
  }
}
