import { Logger, UseFilters } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { HttpException } from "@nestjs/common";
import {
  SocketEvents,
  type DeleteMessagePayload,
  type EditMessagePayload,
  type JoinRoomPayload,
  type LeaveRoomPayload,
  type MarkReadPayload,
  type NewMessagePayload,
  type PinMessagePayload,
  type PresenceUpdatedPayload,
  type PublicProfile,
  type ReactionPayload,
  type TypingPayload,
  type TypingUpdatedPayload,
} from "@chatrooms/contracts";
import { PrismaService } from "@/infra/prisma/prisma.service";
import { RedisService } from "@/infra/redis/redis.service";
import type { AccessPayload } from "@/modules/auth/token.service";
import { MessagesService } from "@/modules/messages/messages.service";
import { ChatEventsService } from "./chat-events.service";

/** Auth context attached to each socket after the handshake. */
interface SocketAuth {
  userId: string;
  profileId: string;
  username: string;
  avatarUrl: string | null;
  reputation: number;
}
type AuthedSocket = Socket & { data: { auth: SocketAuth } };

/**
 * Realtime gateway on namespace /chat.
 *
 * Responsibility split (matters for correctness):
 *  • SEATS (who occupies one of the 10 slots) change via REST join/leave —
 *    those go through the atomic Redis scripts (Step 4) and emit
 *    user_joined / user_left through ChatEventsService.
 *  • This gateway manages SUBSCRIPTIONS + PRESENCE: an already-seated user
 *    opens the room and subscribes; closing the tab drops presence but the
 *    seat survives short disconnects (refresh ≠ losing your spot — a
 *    delayed sweep releases seats only after a grace period).
 */
@UseFilters()
@WebSocketGateway({ namespace: "/chat" })
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(ChatGateway.name);
  /** Seconds an abandoned seat survives after last socket disconnects. */
  static readonly SEAT_GRACE_SEC = 60;

  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly events: ChatEventsService,
    private readonly messages: MessagesService,
  ) {}

  afterInit(server: Server): void {
    this.events.bind(server);

    // Handshake auth middleware — rejects before any event handler runs.
    server.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token as string | undefined;
        if (!token) return next(new Error("UNAUTHORIZED"));
        const payload = this.jwt.verify<AccessPayload>(token, {
          secret: this.config.getOrThrow("JWT_ACCESS_SECRET"),
        });
        if (!payload.pid) return next(new Error("ONBOARDING_REQUIRED"));

        // One DB hit per connection (not per event) — also enforces bans
        // immediately at the realtime layer.
        const profile = await this.prisma.anonymousProfile.findUnique({
          where: { id: payload.pid },
          include: { user: { select: { status: true } } },
        });
        if (!profile || profile.user.status !== "ACTIVE") {
          return next(new Error("UNAUTHORIZED"));
        }
        (socket as AuthedSocket).data.auth = {
          userId: payload.sub,
          profileId: profile.id,
          username: profile.username,
          avatarUrl: profile.avatarUrl,
          reputation: profile.reputation,
        };
        next();
      } catch {
        next(new Error("UNAUTHORIZED"));
      }
    });
  }

  async handleConnection(socket: AuthedSocket): Promise<void> {
    // Personal channel for direct events (queue admission, mod notices).
    await socket.join(`profile:${socket.data.auth.profileId}`);
    // Cancel any pending seat-release from a quick refresh/reconnect.
    await this.redis.client.zrem("cr:sweepq", socket.data.auth.profileId);
  }

  async handleDisconnect(socket: AuthedSocket): Promise<void> {
    const { profileId } = socket.data.auth ?? {};
    if (!profileId) return;

    // Drop presence in every room this socket had open.
    for (const room of socket.rooms) {
      if (!room.startsWith("room:")) continue;
      const roomId = room.slice(5);
      await this.redis.client.srem(this.redis.roomKeys(roomId).online, profileId);
      await this.emitPresence(roomId);
    }

    // Schedule the seat sweep: score = when the grace period ends. The
    // sweeper worker releases this profile's seats (and queue spots) if
    // they haven't reconnected by then; reconnecting ZREMs the entry.
    await this.redis.client.zadd(
      "cr:sweepq",
      Date.now() + ChatGateway.SEAT_GRACE_SEC * 1000,
      profileId,
    );
  }

  // ── Room subscribe / unsubscribe ───────────────────────────────────────

  @SubscribeMessage(SocketEvents.JOIN_ROOM)
  async onJoinRoom(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: JoinRoomPayload,
  ) {
    const { profileId } = socket.data.auth;
    const roomId = String(body?.roomId ?? "");
    const keys = this.redis.roomKeys(roomId);

    // Only seated participants may subscribe — seat is taken via REST first.
    const seated = await this.redis.client.sismember(keys.members, profileId);
    if (!seated) {
      socket.emit(SocketEvents.ERROR, {
        code: "NOT_A_PARTICIPANT",
        message: "Join the room before opening the chat.",
      });
      return;
    }

    await socket.join(`room:${roomId}`);
    await this.redis.client.sadd(keys.online, profileId);
    await this.emitPresence(roomId);
  }

  @SubscribeMessage(SocketEvents.LEAVE_ROOM)
  async onLeaveRoom(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: LeaveRoomPayload,
  ) {
    const { profileId } = socket.data.auth;
    const roomId = String(body?.roomId ?? "");
    await socket.leave(`room:${roomId}`);
    await this.redis.client.srem(this.redis.roomKeys(roomId).online, profileId);
    await this.emitPresence(roomId);
  }

  // ── Typing indicator ───────────────────────────────────────────────────

  @SubscribeMessage(SocketEvents.TYPING)
  async onTyping(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: TypingPayload,
  ) {
    const { profileId, username } = socket.data.auth;
    const roomId = String(body?.roomId ?? "");
    // Trust but verify cheaply: only broadcast into rooms the socket joined.
    if (!socket.rooms.has(`room:${roomId}`)) return;

    // Volatile — broadcast to others only, no persistence. Clients clear the
    // indicator themselves after 3 s without a refresh.
    socket.to(`room:${roomId}`).emit(SocketEvents.TYPING_UPDATED, {
      roomId,
      profileId,
      username,
      isTyping: !!body?.isTyping,
    } satisfies TypingUpdatedPayload);
  }

  // ── Message events (delegate to MessagesService — same rules as REST;
  //    the service itself broadcasts the resulting S2C events) ────────────

  @SubscribeMessage(SocketEvents.NEW_MESSAGE)
  async onNewMessage(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: NewMessagePayload,
  ) {
    await this.safely(socket, () =>
      this.messages.create(String(body?.roomId ?? ""), socket.data.auth.profileId, {
        type: body?.type === "GIF" ? "GIF" : "TEXT",
        content: String(body?.content ?? ""),
        gifUrl: body?.gifUrl,
        replyToId: body?.replyToId,
        clientNonce: body?.clientNonce,
      }),
    );
  }

  @SubscribeMessage(SocketEvents.EDIT_MESSAGE)
  async onEditMessage(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: EditMessagePayload,
  ) {
    await this.safely(socket, () =>
      this.messages.edit(
        String(body?.roomId ?? ""),
        socket.data.auth.profileId,
        String(body?.messageId ?? ""),
        String(body?.content ?? ""),
      ),
    );
  }

  @SubscribeMessage(SocketEvents.DELETE_MESSAGE)
  async onDeleteMessage(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: DeleteMessagePayload,
  ) {
    await this.safely(socket, () =>
      this.messages.delete(
        String(body?.roomId ?? ""),
        socket.data.auth.profileId,
        String(body?.messageId ?? ""),
      ),
    );
  }

  @SubscribeMessage(SocketEvents.ADD_REACTION)
  async onReaction(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: ReactionPayload,
  ) {
    await this.safely(socket, () =>
      this.messages.toggleReaction(
        String(body?.roomId ?? ""),
        socket.data.auth.profileId,
        String(body?.messageId ?? ""),
        body?.emoji,
      ),
    );
  }

  @SubscribeMessage(SocketEvents.PIN_MESSAGE)
  async onPinMessage(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: PinMessagePayload,
  ) {
    await this.safely(socket, () =>
      this.messages.setPinned(
        String(body?.roomId ?? ""),
        socket.data.auth.profileId,
        String(body?.messageId ?? ""),
        !!body?.pinned,
      ),
    );
  }

  @SubscribeMessage(SocketEvents.MARK_READ)
  async onMarkRead(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: MarkReadPayload,
  ) {
    await this.safely(socket, () =>
      this.messages.markRead(
        String(body?.roomId ?? ""),
        socket.data.auth.profileId,
        String(body?.messageId ?? ""),
      ),
    );
  }

  /** Run a service call; surface domain errors to this socket only. */
  private async safely(socket: AuthedSocket, fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      if (e instanceof HttpException) {
        const body = e.getResponse() as { code?: string; message?: string };
        socket.emit(SocketEvents.ERROR, {
          code: body.code ?? "ERROR",
          message: body.message ?? e.message,
        });
      } else {
        this.logger.error(`socket handler error: ${(e as Error).message}`);
        socket.emit(SocketEvents.ERROR, {
          code: "INTERNAL",
          message: "Something went wrong.",
        });
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /** Presence snapshot (≤ room capacity, so a full resend is tiny). */
  private async emitPresence(roomId: string): Promise<void> {
    const ids = await this.redis.client.smembers(this.redis.roomKeys(roomId).online);
    let online: PublicProfile[] = [];
    if (ids.length > 0) {
      const rows = await this.prisma.anonymousProfile.findMany({
        where: { id: { in: ids } },
        select: { id: true, username: true, avatarUrl: true, reputation: true },
      });
      online = rows;
    }
    this.events.toRoom(roomId, SocketEvents.PRESENCE_UPDATED, {
      roomId,
      online,
    } satisfies PresenceUpdatedPayload);
  }
}
