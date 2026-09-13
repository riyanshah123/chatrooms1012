"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Users, Zap } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { FeedPromptCard } from "./prompt-feed";

/** Uniform box height so the 2-per-row grid stays even and the feed
 *  virtualizer can use exact row heights. Keep in sync with prompt-feed. */
export const CARD_HEIGHT = 300;

/**
 * Prompt box — structured like the reference design:
 *   [ category pill ]                    [ 👥 N talking ]
 *   Title (coral)
 *   Description question (muted)
 *   #tag  #tag  #tag
 *   ────────────────────────────────────────────────
 *   (avatar) @creator                       Join Room →
 *
 * The whole card is the join affordance (clickable + keyboard-accessible);
 * unauthenticated users are routed through login first.
 */
export function PromptCard({ prompt }: { prompt: FeedPromptCard }) {
  const router = useRouter();

  // Card opens the prompt detail page (where the room preview + Join lives),
  // matching the reference flow: feed → detail → room.
  const open = () => router.push(`/prompt/${prompt.id}`);

  const full = prompt.onlineCount >= prompt.maxUsers;

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      style={{ height: CARD_HEIGHT }}
      className={`glass group flex cursor-pointer flex-col p-5 transition
        hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
          prompt.boosted ? "border-accent/60 ring-1 ring-accent/30" : ""
        }`}
    >
      {/* Top row: category (+ boosted) + live count */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="pill shrink-0">
            {prompt.category.icon} {prompt.category.name}
          </span>
          {prompt.boosted && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-ink"
              title="Freshly started — boosted to the top"
            >
              <Zap size={11} className="fill-accent-ink" />
              Boosted
            </span>
          )}
        </div>
        <span className="pill shrink-0" title="In the room right now">
          <Users size={13} className={prompt.onlineCount > 0 ? "text-accent" : undefined} />
          {prompt.onlineCount} talking
        </span>
      </div>

      {/* Title — black by default, coral on hover (the featured-card look) */}
      <h3 className="mt-4 line-clamp-2 font-display text-xl font-bold leading-snug text-ink transition-colors group-hover:text-accent">
        {prompt.title}
      </h3>

      {/* Description question */}
      {prompt.description && (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">
          {prompt.description}
        </p>
      )}

      {/* Tags */}
      {prompt.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 overflow-hidden text-sm text-muted/80">
          {prompt.tags.map((t) => (
            <span key={t}>#{t}</span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
        <Avatar username={prompt.creator.username} src={prompt.creator.avatarUrl} size={24} />
        <span className="truncate text-sm text-muted">@{prompt.creator.username}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1 text-sm font-semibold text-accent">
          {full ? "Join queue" : "Join Room"}
          <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </article>
  );
}
