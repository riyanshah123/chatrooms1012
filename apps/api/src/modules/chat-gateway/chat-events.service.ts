import { Injectable } from "@nestjs/common";
import type { Server } from "socket.io";
import { SocketEvents, type SocketEvent } from "@chatrooms/contracts";

/**
 * The one place that emits server→client events. REST services (join/leave,
 * messages, queue, moderation) inject this instead of the gateway — keeps
 * business modules decoupled from Socket.IO and trivially testable.
 *
 * Emits go through the Redis adapter, so they reach every pod's sockets.
 */
@Injectable()
export class ChatEventsService {
  private server: Server | null = null;

  /** Called once by the gateway in afterInit. */
  bind(server: Server): void {
    this.server = server;
  }

  /** Broadcast to everyone subscribed to a chatroom. */
  toRoom(roomId: string, event: SocketEvent, payload: unknown): void {
    this.server?.to(`room:${roomId}`).emit(event, payload);
  }

  /** Direct message to one user (queue admission, moderation notices). */
  toProfile(profileId: string, event: SocketEvent, payload: unknown): void {
    this.server?.to(`profile:${profileId}`).emit(event, payload);
  }

  /** Everyone currently connected (e.g. "a new room just opened"). */
  toEveryone(event: SocketEvent, payload: unknown): void {
    this.server?.emit(event, payload);
  }

  /** Convenience for the most common cross-module emits. */
  events = SocketEvents;
}
