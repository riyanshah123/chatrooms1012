"use client";

/* eslint-disable @next/next/no-img-element */
import { format } from "date-fns";
import { CornerUpLeft, Pin, SmilePlus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  REACTION_EMOJIS,
  REACTION_GLYPHS,
  type MessageView,
  type ReactionEmoji,
} from "@chatrooms/contracts";
import { Avatar } from "@/components/ui/avatar";

/**
 * A grouped message row. When `grouped` is true it's a consecutive message
 * from the same author — we hide the avatar/name/time header and just render
 * the bubble, indented under the group (the TopicTalk chat layout).
 * Every message is left-aligned; the sender is identified by the sidebar and
 * the coral name, not by side.
 */
export function MessageBubble({
  message,
  grouped,
  isMine,
  canModerate,
  onReply,
  onReact,
  onDelete,
  onPin,
}: {
  message: MessageView;
  grouped: boolean;
  isMine: boolean;
  canModerate: boolean;
  onReply: (m: MessageView) => void;
  onReact: (messageId: string, emoji: ReactionEmoji) => void;
  onDelete: (messageId: string) => void;
  onPin: (messageId: string, pinned: boolean) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  if (message.type === "SYSTEM") {
    return <p className="py-2 text-center text-xs text-muted">{message.content}</p>;
  }

  const author = message.author;
  const optimistic = message.id.startsWith("optimistic-");

  return (
    <div className={`flex gap-3 ${grouped ? "mt-0.5" : "mt-4"}`}>
      {/* Avatar gutter — filled only on the first message of a group */}
      <div className="w-9 shrink-0">
        {!grouped &&
          (author ? (
            <Avatar username={author.username} src={author.avatarUrl} size={36} />
          ) : (
            <div className="size-9 rounded-full bg-surface-2" />
          ))}
      </div>

      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="mb-1 flex items-baseline gap-2">
            <span className={`text-sm font-semibold ${isMine ? "text-accent" : "text-ink"}`}>
              {author ? author.username : "…"}
            </span>
            <time className="text-[11px] text-muted" title={message.createdAt}>
              {format(new Date(message.createdAt), "h:mm a")}
            </time>
          </div>
        )}

        {message.replyTo && (
          <p className="mb-1 truncate border-l-2 border-accent/40 pl-2 text-xs text-muted">
            ↪ @{message.replyTo.authorUsername ?? "…"}: {message.replyTo.snippet}
          </p>
        )}

        <div className="group/msg relative flex items-center gap-2">
          {message.deleted ? (
            <p className="rounded-2xl bg-surface-2 px-4 py-2 text-sm italic text-muted">
              message deleted
            </p>
          ) : message.type === "GIF" && message.gifUrl ? (
            <img src={message.gifUrl} alt="GIF" loading="lazy" className="max-h-56 rounded-2xl" />
          ) : (
            <p
              className={`inline-block max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-[15px] leading-relaxed shadow-sm ${
                isMine ? "bg-accent/10 text-ink" : "bg-surface text-ink"
              } ${optimistic ? "opacity-60" : ""}`}
            >
              {message.content}
            </p>
          )}

          {/* Hover actions */}
          {!message.deleted && !optimistic && (
            <div className="hidden items-center gap-0.5 rounded-xl border border-border bg-surface p-0.5 shadow-sm group-hover/msg:flex">
              <IconBtn label="React" onClick={() => setPickerOpen((v) => !v)}>
                <SmilePlus size={14} />
              </IconBtn>
              <IconBtn label="Reply" onClick={() => onReply(message)}>
                <CornerUpLeft size={14} />
              </IconBtn>
              {canModerate && (
                <IconBtn
                  label={message.isPinned ? "Unpin" : "Pin"}
                  onClick={() => onPin(message.id, !message.isPinned)}
                >
                  <Pin size={14} />
                </IconBtn>
              )}
              {(isMine || canModerate) && (
                <IconBtn label="Delete" danger onClick={() => onDelete(message.id)}>
                  <Trash2 size={14} />
                </IconBtn>
              )}
            </div>
          )}

          {pickerOpen && (
            <div
              className="absolute left-0 top-9 z-10 flex gap-1 rounded-xl border border-border bg-surface p-1.5 shadow-lg"
              onMouseLeave={() => setPickerOpen(false)}
            >
              {REACTION_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    onReact(message.id, e);
                    setPickerOpen(false);
                  }}
                  className="rounded-lg p-1 text-lg transition hover:scale-125 hover:bg-surface-2"
                >
                  {REACTION_GLYPHS[e]}
                </button>
              ))}
            </div>
          )}
        </div>

        {message.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => onReact(message.id, r.emoji)}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${
                  r.reactedByMe
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border bg-surface hover:border-accent/40"
                }`}
              >
                {REACTION_GLYPHS[r.emoji]} {r.count}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function IconBtn({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`rounded-lg p-1.5 transition hover:bg-surface-2 ${
        danger ? "text-muted hover:text-danger" : "text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
