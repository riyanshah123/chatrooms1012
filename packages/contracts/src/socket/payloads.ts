import type { PublicProfile } from "../common";
import type { MessageType, ReactionEmoji } from "../enums";
import type { MessageView } from "../dto/message.dto";

// ── Client → Server ─────────────────────────────────────────────────────────

export interface JoinRoomPayload {
  roomId: string;
}
export interface LeaveRoomPayload {
  roomId: string;
}
export interface TypingPayload {
  roomId: string;
  isTyping: boolean;
}
export interface NewMessagePayload {
  roomId: string;
  type: Extract<MessageType, "TEXT" | "GIF">;
  content: string;
  gifUrl?: string;
  replyToId?: string;
  /** Client-generated id for optimistic-UI reconciliation. */
  clientNonce: string;
}
export interface EditMessagePayload {
  roomId: string;
  messageId: string;
  content: string;
}
export interface DeleteMessagePayload {
  roomId: string;
  messageId: string;
}
export interface ReactionPayload {
  roomId: string;
  messageId: string;
  emoji: ReactionEmoji;
}
export interface PinMessagePayload {
  roomId: string;
  messageId: string;
  pinned: boolean;
}
export interface MarkReadPayload {
  roomId: string;
  messageId: string; // newest message the user has seen
}

// ── Server → Client ─────────────────────────────────────────────────────────

export type MessageCreatedPayload = MessageView;

export interface MessageEditedPayload {
  roomId: string;
  messageId: string;
  content: string;
  editedAt: string;
}
export interface MessageDeletedPayload {
  roomId: string;
  messageId: string;
}
export interface MessagePinnedPayload {
  roomId: string;
  messageId: string;
  pinned: boolean;
}
export interface ReactionUpdatedPayload {
  roomId: string;
  messageId: string;
  emoji: ReactionEmoji;
  count: number;
  /** Profile whose reaction toggled — clients update their own reactedByMe. */
  profileId: string;
  added: boolean;
}
export interface UserJoinedPayload {
  roomId: string;
  profile: PublicProfile;
  memberCount: number;
}
export interface UserLeftPayload {
  roomId: string;
  profileId: string;
  memberCount: number;
}
export interface UserKickedPayload {
  roomId: string;
  profileId: string;
  reason?: string;
}
export interface UserMutedPayload {
  roomId: string;
  profileId: string;
  mutedUntil: string;
}
export interface TypingUpdatedPayload {
  roomId: string;
  profileId: string;
  username: string;
  isTyping: boolean;
}
export interface PresenceUpdatedPayload {
  roomId: string;
  online: PublicProfile[]; // full snapshot ≤ capacity (10) — cheap to resend
}
export interface RoomFullPayload {
  roomId: string;
  queueLength: number;
}
export interface WaitingQueuePayload {
  roomId: string;
  position: number; // 1-based; your place in line
  queueLength: number;
}
export interface QueueAdmittedPayload {
  roomId: string;
  /** Seconds to confirm the seat before it's offered to the next in line. */
  confirmWithinSec: number;
}
export interface SocketErrorPayload {
  code: string;
  message: string;
}

/** Broadcast to everyone when a new discussion room opens. */
export interface RoomCreatedPayload {
  promptId: string;
  chatroomId: string;
  title: string;
  categoryName: string;
  creatorUsername: string;
}
