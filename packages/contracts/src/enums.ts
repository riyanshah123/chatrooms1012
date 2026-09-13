/**
 * Enums shared by API and web. String values match the Prisma enums exactly
 * so payloads pass through without mapping.
 */
export const CATEGORIES = [
  "sports",
  "movies",
  "tv-shows",
  "anime",
  "politics",
  "technology",
  "science",
  "history",
  "gaming",
  "finance",
  "books",
  "music",
  "travel",
  "food",
  "education",
  "health",
  "random",
] as const;
export type CategorySlug = (typeof CATEGORIES)[number];

export type Visibility = "PUBLIC" | "PRIVATE";
export type RoomType = "PROMPT" | "TOPIC";
export type RoomStatus = "ACTIVE" | "ARCHIVED" | "CLOSED";
export type ParticipantRole = "OWNER" | "MODERATOR" | "MEMBER";
export type MessageType = "TEXT" | "GIF" | "SYSTEM";
export type UserRole = "USER" | "MODERATOR" | "ADMIN";
export type QueueStatus = "WAITING" | "ADMITTED" | "EXPIRED" | "CANCELLED";

export const REACTION_EMOJIS = [
  "LIKE",
  "LOVE",
  "LAUGH",
  "WOW",
  "SAD",
  "ANGRY",
  "FIRE",
  "THINKING",
] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

/** Emoji glyph per reaction, single source for the UI. */
export const REACTION_GLYPHS: Record<ReactionEmoji, string> = {
  LIKE: "👍",
  LOVE: "❤️",
  LAUGH: "😂",
  WOW: "😮",
  SAD: "😢",
  ANGRY: "😡",
  FIRE: "🔥",
  THINKING: "🤔",
};

export type ReportReason =
  | "SPAM"
  | "HARASSMENT"
  | "HATE_SPEECH"
  | "VIOLENCE"
  | "SEXUAL_CONTENT"
  | "MISINFORMATION"
  | "DOXXING"
  | "OTHER";

export type NotificationType =
  | "QUEUE_ADMITTED"
  | "REPLY"
  | "REACTION"
  | "MENTION"
  | "ROOM_ACTIVITY"
  | "MODERATION"
  | "SYSTEM";
