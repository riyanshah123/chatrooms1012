"use client";

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  SocketEvents,
  type MessageCreatedPayload,
  type MessageDeletedPayload,
  type MessageEditedPayload,
  type MessagePinnedPayload,
  type MessageView,
  type Paginated,
  type PresenceUpdatedPayload,
  type PublicProfile,
  type QueueAdmittedPayload,
  type ReactionEmoji,
  type ReactionUpdatedPayload,
  type SocketErrorPayload,
  type TypingUpdatedPayload,
  type UserJoinedPayload,
  type UserLeftPayload,
  type WaitingQueuePayload,
} from "@chatrooms/contracts";
import { api, ApiRequestError } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth";

export interface RoomView {
  id: string;
  type: "PROMPT" | "TOPIC";
  title: string;
  capacity: number;
  memberCount: number;
  queueLength: number;
  mySeat: "MEMBER" | "OWNER" | "MODERATOR" | null;
  myQueuePosition: number | null;
  category: { name: string; icon: string | null } | null;
  prompt: { id: string; title: string; description: string | null } | null;
  topic: { slug: string; title: string } | null;
  members: PublicProfile[];
  pinned: Array<{ id: string; content: string; authorUsername: string | null }>;
}

type MessagesCache = { pages: Paginated<MessageView>[]; pageParams: string[] };

/**
 * Everything a chatroom needs, in one hook:
 *  join flow (seat / ROOM_FULL / queue) · message history (cursor-paged) ·
 *  socket subscription with cache-patching handlers · optimistic sends
 *  reconciled by clientNonce · typing (in + out) · presence.
 *
 * Cache strategy: socket events PATCH the React Query caches directly —
 * no refetch storms; the server remains the source of truth because every
 * patch is derived from a server broadcast.
 */
export function useChatRoom(roomId: string) {
  const queryClient = useQueryClient();
  const { status, profile } = useAuthStore();

  const [roomFull, setRoomFull] = useState<{ queueLength: number } | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [online, setOnline] = useState<PublicProfile[]>([]);
  const [socketError, setSocketError] = useState<SocketErrorPayload | null>(null);
  const typingTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── Room state ─────────────────────────────────────────────────────────

  const room = useQuery({
    queryKey: qk.room(roomId),
    queryFn: () => api<RoomView>(`/chatrooms/${roomId}`),
    enabled: status === "authenticated",
    staleTime: 10_000,
  });

  const seated = room.data?.mySeat != null;

  // Auto-join on first load: seatless visitors try to take a seat; a full
  // room surfaces the queue dialog instead.
  const joinAttempted = useRef(false);
  useEffect(() => {
    if (!room.data || seated || joinAttempted.current) return;
    joinAttempted.current = true;
    void (async () => {
      try {
        await api(`/chatrooms/${roomId}/join`, { method: "POST" });
        await queryClient.invalidateQueries({ queryKey: qk.room(roomId) });
      } catch (e) {
        if (e instanceof ApiRequestError && e.code === "ROOM_FULL") {
          setRoomFull({ queueLength: Number(e.details?.queueLength ?? 0) });
          if (room.data?.myQueuePosition) setQueuePosition(room.data.myQueuePosition);
        } else if (e instanceof ApiRequestError) {
          setSocketError({ code: e.code, message: e.message });
        }
      }
    })();
  }, [room.data, seated, roomId, queryClient]);

  // ── Message history ────────────────────────────────────────────────────

  const messages = useInfiniteQuery({
    queryKey: qk.messages(roomId),
    queryFn: ({ pageParam }) =>
      api<Paginated<MessageView>>(
        `/chatrooms/${roomId}/messages${pageParam ? `?cursor=${pageParam}` : ""}`,
      ),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: seated,
    staleTime: Infinity, // socket patches keep it fresh
  });

  /** Oldest-first flat list for rendering (API pages are newest-first). */
  const messageList: MessageView[] = (messages.data?.pages ?? [])
    .flatMap((p) => p.items)
    .reverse();

  // ── Cache patch helpers ────────────────────────────────────────────────

  const patchMessages = useCallback(
    (fn: (m: MessageView) => MessageView) => {
      queryClient.setQueryData<MessagesCache>(qk.messages(roomId), (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((p) => ({ ...p, items: p.items.map(fn) })),
            }
          : old,
      );
    },
    [queryClient, roomId],
  );

  const prependMessage = useCallback(
    (msg: MessageView) => {
      queryClient.setQueryData<MessagesCache>(qk.messages(roomId), (old) => {
        if (!old) return old;
        const [first, ...rest] = old.pages;
        // Reconcile optimistic row (same clientNonce) or dedupe re-delivery.
        const withoutDupes = (first?.items ?? []).filter(
          (m) =>
            m.id !== msg.id &&
            !(msg.clientNonce && m.clientNonce === msg.clientNonce),
        );
        return {
          ...old,
          pages: [{ ...first, items: [msg, ...withoutDupes] }, ...rest],
        };
      });
    },
    [queryClient, roomId],
  );

  // ── Socket wiring ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!seated || status !== "authenticated") return;
    const socket = getSocket();

    const subscribe = () => socket.emit(SocketEvents.JOIN_ROOM, { roomId });
    if (socket.connected) subscribe();
    socket.on("connect", subscribe); // re-subscribe after reconnects

    const onCreated = (msg: MessageCreatedPayload) => {
      if (msg.roomId !== roomId) return;
      prependMessage(msg);
    };
    const onEdited = (p: MessageEditedPayload) => {
      if (p.roomId !== roomId) return;
      patchMessages((m) =>
        m.id === p.messageId ? { ...m, content: p.content, editedAt: p.editedAt } : m,
      );
    };
    const onDeleted = (p: MessageDeletedPayload) => {
      if (p.roomId !== roomId) return;
      patchMessages((m) =>
        m.id === p.messageId ? { ...m, deleted: true, content: "", gifUrl: null } : m,
      );
    };
    const onPinned = (p: MessagePinnedPayload) => {
      if (p.roomId !== roomId) return;
      patchMessages((m) => (m.id === p.messageId ? { ...m, isPinned: p.pinned } : m));
      void queryClient.invalidateQueries({ queryKey: qk.room(roomId) });
    };
    const onReaction = (p: ReactionUpdatedPayload) => {
      if (p.roomId !== roomId) return;
      patchMessages((m) => {
        if (m.id !== p.messageId) return m;
        const mine = p.profileId === profile?.id;
        const rest = m.reactions.filter((r) => r.emoji !== p.emoji);
        const prev = m.reactions.find((r) => r.emoji === p.emoji);
        const reactedByMe = mine ? p.added : (prev?.reactedByMe ?? false);
        return {
          ...m,
          reactions:
            p.count > 0
              ? [...rest, { emoji: p.emoji, count: p.count, reactedByMe }]
              : rest,
        };
      });
    };
    const onTyping = (p: TypingUpdatedPayload) => {
      if (p.roomId !== roomId || p.profileId === profile?.id) return;
      setTypingUsers((prev) => {
        const next = new Map(prev);
        if (p.isTyping) next.set(p.profileId, p.username);
        else next.delete(p.profileId);
        return next;
      });
      // Self-expire after 3.5 s of silence.
      const timeouts = typingTimeouts.current;
      clearTimeout(timeouts.get(p.profileId));
      if (p.isTyping) {
        timeouts.set(
          p.profileId,
          setTimeout(() => {
            setTypingUsers((prev) => {
              const next = new Map(prev);
              next.delete(p.profileId);
              return next;
            });
          }, 3_500),
        );
      }
    };
    const onPresence = (p: PresenceUpdatedPayload) => {
      if (p.roomId === roomId) setOnline(p.online);
    };
    const onMember = (p: UserJoinedPayload | UserLeftPayload) => {
      if (p.roomId === roomId) {
        void queryClient.invalidateQueries({ queryKey: qk.room(roomId) });
      }
    };
    const onError = (p: SocketErrorPayload) => setSocketError(p);

    socket.on(SocketEvents.MESSAGE_CREATED, onCreated);
    socket.on(SocketEvents.MESSAGE_EDITED, onEdited);
    socket.on(SocketEvents.MESSAGE_DELETED, onDeleted);
    socket.on(SocketEvents.MESSAGE_PINNED, onPinned);
    socket.on(SocketEvents.REACTION_UPDATED, onReaction);
    socket.on(SocketEvents.TYPING_UPDATED, onTyping);
    socket.on(SocketEvents.PRESENCE_UPDATED, onPresence);
    socket.on(SocketEvents.USER_JOINED, onMember);
    socket.on(SocketEvents.USER_LEFT, onMember);
    socket.on(SocketEvents.ERROR, onError);

    return () => {
      socket.emit(SocketEvents.LEAVE_ROOM, { roomId });
      socket.off("connect", subscribe);
      socket.off(SocketEvents.MESSAGE_CREATED, onCreated);
      socket.off(SocketEvents.MESSAGE_EDITED, onEdited);
      socket.off(SocketEvents.MESSAGE_DELETED, onDeleted);
      socket.off(SocketEvents.MESSAGE_PINNED, onPinned);
      socket.off(SocketEvents.REACTION_UPDATED, onReaction);
      socket.off(SocketEvents.TYPING_UPDATED, onTyping);
      socket.off(SocketEvents.PRESENCE_UPDATED, onPresence);
      socket.off(SocketEvents.USER_JOINED, onMember);
      socket.off(SocketEvents.USER_LEFT, onMember);
      socket.off(SocketEvents.ERROR, onError);
    };
  }, [seated, status, roomId, profile?.id, patchMessages, prependMessage, queryClient]);

  // Queue events arrive on the personal channel even before being seated.
  useEffect(() => {
    if (status !== "authenticated") return;
    const socket = getSocket();
    const onQueue = (p: WaitingQueuePayload) => {
      if (p.roomId === roomId) setQueuePosition(p.position);
    };
    const onAdmitted = (p: QueueAdmittedPayload) => {
      if (p.roomId !== roomId) return;
      setRoomFull(null);
      setQueuePosition(null);
      void queryClient.invalidateQueries({ queryKey: qk.room(roomId) });
    };
    socket.on(SocketEvents.WAITING_QUEUE, onQueue);
    socket.on(SocketEvents.QUEUE_ADMITTED, onAdmitted);
    return () => {
      socket.off(SocketEvents.WAITING_QUEUE, onQueue);
      socket.off(SocketEvents.QUEUE_ADMITTED, onAdmitted);
    };
  }, [status, roomId, queryClient]);

  // ── Actions ────────────────────────────────────────────────────────────

  const send = useCallback(
    (input: { content: string; replyToId?: string; gifUrl?: string }) => {
      if (!profile) return;
      const clientNonce = crypto.randomUUID();
      // Optimistic row — replaced when the server's MESSAGE_CREATED echoes
      // back with the same nonce.
      prependMessage({
        id: `optimistic-${clientNonce}`,
        roomId,
        type: input.gifUrl ? "GIF" : "TEXT",
        content: input.content,
        gifUrl: input.gifUrl ?? null,
        author: { ...profile, reputation: 0 },
        replyTo: null,
        reactions: [],
        isPinned: false,
        deleted: false,
        editedAt: null,
        createdAt: new Date().toISOString(),
        clientNonce,
      });
      getSocket().emit(SocketEvents.NEW_MESSAGE, {
        roomId,
        type: input.gifUrl ? "GIF" : "TEXT",
        content: input.content,
        gifUrl: input.gifUrl,
        replyToId: input.replyToId,
        clientNonce,
      });
    },
    [profile, roomId, prependMessage],
  );

  const emitTyping = useCallback(
    (isTyping: boolean) => getSocket().emit(SocketEvents.TYPING, { roomId, isTyping }),
    [roomId],
  );

  const react = useCallback(
    (messageId: string, emoji: ReactionEmoji) =>
      getSocket().emit(SocketEvents.ADD_REACTION, { roomId, messageId, emoji }),
    [roomId],
  );

  const remove = useCallback(
    (messageId: string) =>
      getSocket().emit(SocketEvents.DELETE_MESSAGE, { roomId, messageId }),
    [roomId],
  );

  const pin = useCallback(
    (messageId: string, pinned: boolean) =>
      getSocket().emit(SocketEvents.PIN_MESSAGE, { roomId, messageId, pinned }),
    [roomId],
  );

  const markRead = useCallback(
    (messageId: string) =>
      getSocket().emit(SocketEvents.MARK_READ, { roomId, messageId }),
    [roomId],
  );

  const joinQueue = useCallback(async () => {
    const res = await api<{ status: "SEATED" } | { status: "WAITING"; position: number }>(
      `/chatrooms/${roomId}/queue`,
      { method: "POST" },
    );
    if (res.status === "SEATED") {
      setRoomFull(null);
      await queryClient.invalidateQueries({ queryKey: qk.room(roomId) });
    } else {
      setQueuePosition(res.position);
    }
    return res;
  }, [roomId, queryClient]);

  const leaveQueue = useCallback(async () => {
    await api(`/chatrooms/${roomId}/queue`, { method: "DELETE" });
    setQueuePosition(null);
  }, [roomId]);

  const leaveRoom = useCallback(async () => {
    await api(`/chatrooms/${roomId}/leave`, { method: "POST" });
    void queryClient.invalidateQueries({ queryKey: qk.room(roomId) });
  }, [roomId, queryClient]);

  return {
    room: room.data ?? null,
    roomLoading: room.isLoading,
    seated,
    roomFull,
    queuePosition,
    online,
    typingUsers: [...typingUsers.values()],
    socketError,
    clearSocketError: () => setSocketError(null),
    messageList,
    loadOlder: messages.fetchNextPage,
    hasOlder: messages.hasNextPage ?? false,
    loadingOlder: messages.isFetchingNextPage,
    send,
    emitTyping,
    react,
    remove,
    pin,
    markRead,
    joinQueue,
    leaveQueue,
    leaveRoom,
  };
}
