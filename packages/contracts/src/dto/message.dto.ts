import type { MessageType, ReactionEmoji } from "../enums";
import type { PublicProfile } from "../common";

/** Message as rendered by the client — used by both REST history and sockets. */
export interface MessageView {
  id: string;
  roomId: string;
  type: MessageType;
  /** Sanitized text. For deleted messages: "" with deleted=true. */
  content: string;
  gifUrl: string | null;
  author: PublicProfile | null; // null for SYSTEM messages
  replyTo: {
    id: string;
    authorUsername: string | null;
    snippet: string; // first ~80 chars, for the inline reply preview
  } | null;
  reactions: Array<{ emoji: ReactionEmoji; count: number; reactedByMe: boolean }>;
  isPinned: boolean;
  deleted: boolean;
  editedAt: string | null; // ISO timestamps everywhere on the wire
  createdAt: string;
  /** Echoed back on message_created so the sender reconciles its optimistic row. */
  clientNonce?: string;
}
