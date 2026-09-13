"use client";

import { ImagePlay, SendHorizonal, X } from "lucide-react";
import { useRef, useState } from "react";
import type { MessageView } from "@chatrooms/contracts";

/**
 * Message composer (TopicTalk-style): a rounded pill input with a circular
 * coral send button. Enter sends, Shift+Enter newlines. Reply banner + GIF
 * attach live above the input; typing signals are throttled.
 */
export function Composer({
  replyTo,
  onCancelReply,
  onSend,
  onTyping,
  disabled,
}: {
  replyTo: MessageView | null;
  onCancelReply: () => void;
  onSend: (input: { content: string; replyToId?: string; gifUrl?: string }) => void;
  onTyping: (isTyping: boolean) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [gifUrl, setGifUrl] = useState("");
  const [gifOpen, setGifOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingSent = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signalTyping = () => {
    const now = Date.now();
    if (now - lastTypingSent.current > 2_000) {
      lastTypingSent.current = now;
      onTyping(true);
    }
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(() => onTyping(false), 1_500);
  };

  const send = () => {
    const content = text.trim();
    const gif = gifUrl.trim();
    if (!content && !gif) return;
    onSend({ content, replyToId: replyTo?.id, gifUrl: gif || undefined });
    setText("");
    setGifUrl("");
    setGifOpen(false);
    onCancelReply();
    onTyping(false);
    textareaRef.current?.focus();
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  return (
    <div className="border-t border-border/70 p-3 sm:p-4">
      {replyTo && (
        <div className="mb-2 flex items-center justify-between rounded-lg border-l-2 border-accent bg-surface-2 px-3 py-1.5 text-xs">
          <span className="truncate text-muted">
            Replying to <b>@{replyTo.author?.username}</b>: {replyTo.content.slice(0, 60)}
          </span>
          <button aria-label="Cancel reply" onClick={onCancelReply} className="text-muted hover:text-ink">
            <X size={14} />
          </button>
        </div>
      )}

      {gifOpen && (
        <input
          value={gifUrl}
          onChange={(e) => setGifUrl(e.target.value)}
          placeholder="Paste a Giphy/Tenor media URL…"
          className="input mb-2 text-sm"
        />
      )}

      <div className="flex items-end gap-2 rounded-full border border-border bg-surface py-1.5 pl-2 pr-1.5 shadow-sm focus-within:border-accent/40">
        <button
          aria-label="Attach GIF"
          onClick={() => setGifOpen((v) => !v)}
          className={`shrink-0 rounded-full p-2 transition ${
            gifOpen ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2 hover:text-ink"
          }`}
        >
          <ImagePlay size={19} />
        </button>

        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          disabled={disabled}
          placeholder={disabled ? "You can't send messages right now" : "Message… (Enter to send)"}
          onChange={(e) => {
            setText(e.target.value);
            signalTyping();
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          className="max-h-[120px] flex-1 resize-none bg-transparent py-2 text-[15px] outline-none placeholder:text-muted/70"
        />

        <button
          aria-label="Send"
          onClick={send}
          disabled={disabled || (!text.trim() && !gifUrl.trim())}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition hover:opacity-85 active:scale-95 disabled:opacity-40"
        >
          <SendHorizonal size={18} />
        </button>
      </div>
    </div>
  );
}
