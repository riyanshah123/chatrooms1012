"use client";

import { useEffect, useRef } from "react";
import type { MessageView, ReactionEmoji } from "@chatrooms/contracts";
import { Spinner } from "@/components/ui/spinner";
import { MessageBubble } from "./message-bubble";

/** Consecutive messages from one author within this window are grouped. */
const GROUP_WINDOW_MS = 5 * 60_000;

/**
 * Scrolling message pane. Sticks to the bottom while the user is near it,
 * preserves position when older history loads at the top, groups consecutive
 * messages by author, and reports the newest seen message for unread state.
 */
export function MessageList({
  messages,
  myProfileId,
  canModerate,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  onReply,
  onReact,
  onDelete,
  onPin,
  onLatestSeen,
}: {
  messages: MessageView[];
  myProfileId: string | null;
  canModerate: boolean;
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onReply: (m: MessageView) => void;
  onReact: (id: string, emoji: ReactionEmoji) => void;
  onDelete: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onLatestSeen: (messageId: string) => void;
}) {
  const paneRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const prevHeight = useRef(0);
  const lastSeen = useRef<string | null>(null);

  const onScroll = () => {
    const el = paneRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (el.scrollTop < 80 && hasOlder && !loadingOlder) {
      prevHeight.current = el.scrollHeight;
      onLoadOlder();
    }
  };

  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    if (prevHeight.current) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
      prevHeight.current = 0;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
    const newest = [...messages].reverse().find((m) => !m.id.startsWith("optimistic-"));
    if (newest && newest.id !== lastSeen.current && stickToBottom.current) {
      lastSeen.current = newest.id;
      onLatestSeen(newest.id);
    }
  }, [messages, onLatestSeen]);

  return (
    <div ref={paneRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-4">
      {loadingOlder && (
        <div className="flex justify-center py-3">
          <Spinner />
        </div>
      )}
      {!hasOlder && messages.length > 0 && (
        <p className="py-3 text-center text-xs text-muted">
          This is the beginning of the conversation.
        </p>
      )}

      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const grouped =
          !!prev &&
          prev.type !== "SYSTEM" &&
          m.type !== "SYSTEM" &&
          prev.author?.id === m.author?.id &&
          new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_WINDOW_MS;
        return (
          <MessageBubble
            key={m.id}
            message={m}
            grouped={grouped}
            isMine={m.author?.id === myProfileId}
            canModerate={canModerate}
            onReply={onReply}
            onReact={onReact}
            onDelete={onDelete}
            onPin={onPin}
          />
        );
      })}

      {messages.length === 0 && (
        <p className="py-16 text-center text-muted">Quiet in here… say something.</p>
      )}
    </div>
  );
}
