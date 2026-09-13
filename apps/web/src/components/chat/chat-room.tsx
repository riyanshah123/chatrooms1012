"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Pin, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { MessageView } from "@chatrooms/contracts";
import { Avatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { useChatRoom } from "@/hooks/use-chat-room";
import { useAuthStore } from "@/stores/auth";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { RoomFullDialog } from "./room-full-dialog";
import { TypingDots } from "./typing-dots";

/**
 * The chatroom screen (TopicTalk-style): a header with the category pill,
 * title, live count and a close button; a left "IN THIS ROOM" member rail
 * with a Leave Room control; and the grouped-bubble chat with a pill
 * composer. Handles auth redirect → auto-join → Room Full → queue → chat.
 */
export function ChatRoom({ roomId }: { roomId: string }) {
  const router = useRouter();
  const { status, profile } = useAuthStore();
  const [replyTo, setReplyTo] = useState<MessageView | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);

  const {
    room,
    roomLoading,
    seated,
    roomFull,
    queuePosition,
    online,
    typingUsers,
    socketError,
    clearSocketError,
    messageList,
    loadOlder,
    hasOlder,
    loadingOlder,
    send,
    emitTyping,
    react,
    remove,
    pin,
    markRead,
    joinQueue,
    leaveQueue,
    leaveRoom,
  } = useChatRoom(roomId);

  useEffect(() => {
    if (status === "anonymous") {
      sessionStorage.setItem("cr-return-to", `/room/${roomId}`);
      router.replace("/login");
    }
  }, [status, roomId, router]);

  useEffect(() => {
    if (!socketError) return;
    const t = setTimeout(clearSocketError, 4_000);
    return () => clearTimeout(t);
  }, [socketError, clearSocketError]);

  if (status !== "authenticated" || roomLoading || !room) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-8" />
      </main>
    );
  }

  const canModerate = room.mySeat === "OWNER" || room.mySeat === "MODERATOR";
  const onlineIds = new Set(online.map((o) => o.id));
  const close = () =>
    router.push(room.prompt ? `/prompt/${room.prompt.id}` : "/");

  const memberRail = (
    <div className="flex h-full flex-col">
      <p className="px-4 pt-4 text-xs font-semibold uppercase tracking-wider text-muted">
        In this room
      </p>
      <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {room.members.map((m) => (
          <li key={m.id}>
            <Link
              href={`/profile/${m.username}`}
              className="flex items-center gap-2.5 rounded-lg p-2 transition hover:bg-surface-2"
            >
              <span className="relative">
                <Avatar username={m.username} src={m.avatarUrl} size={32} />
                {onlineIds.has(m.id) && (
                  <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-surface bg-emerald-500" />
                )}
              </span>
              <span className="truncate text-sm">{m.username}</span>
              {m.id === profile?.id && (
                <span className="ml-auto rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                  You
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      <div className="border-t border-border p-2">
        <button
          onClick={() => void leaveRoom().then(() => router.push("/"))}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-danger"
        >
          <LogOut size={16} /> Leave Room
        </button>
      </div>
    </div>
  );

  return (
    <main className="mx-auto flex h-dvh w-full max-w-6xl flex-col p-0 sm:p-4">
      <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden sm:rounded-2xl">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          {room.category && (
            <span className="hidden shrink-0 items-center gap-1 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent sm:inline-flex">
              {room.category.icon} {room.category.name}
            </span>
          )}
          <h1 className="min-w-0 flex-1 truncate font-display text-lg font-bold">{room.title}</h1>
          <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-muted sm:inline-flex">
            <Users size={13} />
            {room.memberCount}/{room.capacity} in room
          </span>
          <button
            onClick={() => setMembersOpen((v) => !v)}
            aria-label="Members"
            className={`rounded-full p-2 transition sm:hidden ${membersOpen ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2"}`}
          >
            <Users size={18} />
          </button>
          <button
            onClick={close}
            aria-label="Close room"
            className="rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-ink"
          >
            <X size={18} />
          </button>
        </header>

        {/* Pinned bar */}
        {room.pinned.length > 0 && (
          <div className="flex items-center gap-2 border-b border-border bg-accent/5 px-4 py-1.5 text-xs">
            <Pin size={12} className="shrink-0 text-accent" />
            <p className="truncate">
              <b>@{room.pinned[0].authorUsername ?? "…"}:</b> {room.pinned[0].content}
            </p>
          </div>
        )}

        <div className="relative flex min-h-0 flex-1">
          {/* Member rail (desktop) */}
          <aside className="hidden w-60 shrink-0 border-r border-border sm:block">
            {memberRail}
          </aside>

          {/* Chat column */}
          <div className="flex min-w-0 flex-1 flex-col">
            {seated ? (
              <>
                <MessageList
                  messages={messageList}
                  myProfileId={profile?.id ?? null}
                  canModerate={canModerate}
                  hasOlder={hasOlder}
                  loadingOlder={loadingOlder}
                  onLoadOlder={() => void loadOlder()}
                  onReply={setReplyTo}
                  onReact={react}
                  onDelete={remove}
                  onPin={pin}
                  onLatestSeen={markRead}
                />
                <div className="px-4">
                  <TypingDots usernames={typingUsers} />
                </div>
                {socketError && (
                  <p className="mx-4 mb-1 rounded-lg bg-danger/10 px-3 py-1.5 text-xs text-danger">
                    {socketError.message}
                  </p>
                )}
                <Composer
                  replyTo={replyTo}
                  onCancelReply={() => setReplyTo(null)}
                  onSend={send}
                  onTyping={emitTyping}
                />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-muted">
                {roomFull ? "Waiting for a seat…" : <Spinner className="size-7" />}
              </div>
            )}
          </div>

          {/* Member rail (mobile drawer) */}
          {membersOpen && (
            <aside className="absolute inset-y-0 right-0 z-20 w-64 border-l border-border bg-surface shadow-xl sm:hidden">
              {memberRail}
            </aside>
          )}
        </div>
      </div>

      <RoomFullDialog
        open={!!roomFull && !seated}
        queueLength={roomFull?.queueLength ?? 0}
        position={queuePosition}
        onJoinQueue={joinQueue}
        onLeaveQueue={leaveQueue}
      />
    </main>
  );
}
