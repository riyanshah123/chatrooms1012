/**
 * Socket.IO event names — single source of truth for gateway and client.
 * C2S = client → server, S2C = server → client.
 */
export const SocketEvents = {
  // ── C2S ──────────────────────────────────────────────
  JOIN_ROOM: "join_room",
  LEAVE_ROOM: "leave_room",
  TYPING: "typing", // { roomId, isTyping }
  NEW_MESSAGE: "new_message",
  EDIT_MESSAGE: "edit_message",
  DELETE_MESSAGE: "delete_message",
  ADD_REACTION: "add_reaction",
  REMOVE_REACTION: "remove_reaction",
  PIN_MESSAGE: "pin_message",
  MARK_READ: "mark_read",

  // ── S2C ──────────────────────────────────────────────
  MESSAGE_CREATED: "message_created",
  MESSAGE_EDITED: "message_edited",
  MESSAGE_DELETED: "message_deleted",
  MESSAGE_PINNED: "message_pinned",
  REACTION_UPDATED: "reaction_updated",
  USER_JOINED: "user_joined",
  USER_LEFT: "user_left",
  USER_KICKED: "user_kicked",
  USER_MUTED: "user_muted",
  TYPING_UPDATED: "typing_updated",
  PRESENCE_UPDATED: "presence_updated", // online users list changed
  ROOM_FULL: "room_full",
  WAITING_QUEUE: "waiting_queue", // your position changed
  QUEUE_ADMITTED: "queue_admitted", // your seat is ready — confirm to enter
  ROOM_CREATED: "room_created", // someone opened a new room (global broadcast)
  ERROR: "socket_error",
} as const;

export type SocketEvent = (typeof SocketEvents)[keyof typeof SocketEvents];
