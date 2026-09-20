"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState } from "react";
import type { Paginated, PublicProfile, Visibility } from "@chatrooms/contracts";
import { CardSkeleton } from "@/components/ui/skeleton";
import { useCategories } from "@/hooks/use-categories";
import { useInfiniteFeed } from "@/hooks/use-infinite-feed";
import { useAuthStore } from "@/stores/auth";
import { CARD_HEIGHT, PromptCard } from "./prompt-card";

/** Shape returned by GET /prompts (mirrors the API's PromptCard). */
export interface FeedPromptCard {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  category: { slug: string; name: string; icon: string | null };
  creator: PublicProfile;
  chatroomId: string;
  visibility: Visibility;
  maxUsers: number;
  onlineCount: number;
  messageCount: number;
  boosted: boolean;
  createdAt: string;
}

interface CategoryChip {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
}

const GAP = 16;

/**
 * The endless feed — a responsive grid (1/2/3 per row), window-virtualized by
 * ROW. Rows measure their own height rather than assuming a fixed one, so a
 * long title or description grows the row instead of being clipped, and cards
 * in a row stretch to match. Only rows near the viewport are mounted;
 * pagination fires when the last rendered row is within 3 of the end.
 */
export function PromptFeed({
  initialPage,
  categories: initialCategories,
}: {
  initialPage: Paginated<FeedPromptCard>;
  categories: CategoryChip[];
}) {
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<"new" | "hot">("new");
  // Fetched client-side (seeded by SSR) so chips appear even if SSR was cold.
  const categories = useCategories(initialCategories);

  // Logged-in users get the personalized "For You" feed; everyone else sees
  // the generic newest feed (which the SSR page already provides).
  const personalized = useAuthStore((s) => s.status) === "authenticated";

  const { items, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteFeed({ sort, category, initialPage, personalized });

  // Responsive column count — must agree with the grid-cols-* classes below
  // so the virtualizer slices rows correctly (1 → 2 → 3 across breakpoints).
  const [cols, setCols] = useState(3);
  useEffect(() => {
    const sm = window.matchMedia("(min-width: 640px)");
    const lg = window.matchMedia("(min-width: 1024px)");
    const apply = () => setCols(lg.matches ? 3 : sm.matches ? 2 : 1);
    apply();
    sm.addEventListener("change", apply);
    lg.addEventListener("change", apply);
    return () => {
      sm.removeEventListener("change", apply);
      lg.removeEventListener("change", apply);
    };
  }, []);

  const rowCount = Math.ceil(items.length / cols);

  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useEffect(() => {
    setScrollMargin(listRef.current?.offsetTop ?? 0);
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    // Rows measure themselves below; this is only the pre-render guess.
    estimateSize: () => CARD_HEIGHT + GAP,
    overscan: 4,
    scrollMargin,
  });
  const virtualRows = virtualizer.getVirtualItems();

  // Pagination driven by the rendered range.
  useEffect(() => {
    const last = virtualRows[virtualRows.length - 1];
    if (!last) return;
    if (last.index >= rowCount - 3 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [virtualRows, rowCount, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <section aria-label="Discussion prompts">
      {/* Filter bar */}
      <div className="sticky top-16 z-30 -mx-4 border-b border-border/60 bg-bg/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          <button
            onClick={() => setSort(sort === "new" ? "hot" : "new")}
            className="chip chip-active shrink-0"
          >
            {sort === "new" ? "Newest" : "Hot"}
          </button>
          <button
            onClick={() => setCategory(null)}
            className={`chip shrink-0 ${category === null ? "chip-active" : ""}`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.slug}
              onClick={() => setCategory(category === c.slug ? null : c.slug)}
              className={`chip shrink-0 ${category === c.slug ? "chip-active" : ""}`}
            >
              {c.icon} {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Initial skeleton grid */}
      {isLoading && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Virtualized rows of `cols` cards */}
      <div ref={listRef} className="mt-4">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualRows.map((vr) => {
            const rowItems = items.slice(vr.index * cols, vr.index * cols + cols);
            return (
              <div
                key={vr.key}
                ref={virtualizer.measureElement}
                data-index={vr.index}
                className="grid grid-cols-1 gap-4 pb-4 sm:grid-cols-2 lg:grid-cols-3"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vr.start - virtualizer.options.scrollMargin}px)`,
                }}
              >
                {rowItems.map((p) => (
                  <PromptCard key={p.id} prompt={p} />
                ))}
              </div>
            );
          })}
        </div>

        {isFetchingNextPage && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="glass p-10 text-center text-muted">
            Nothing here yet — be the first to{" "}
            <a href="/create" className="font-medium text-ink underline">
              start a discussion
            </a>
            .
          </div>
        )}

        {!hasNextPage && items.length > 0 && (
          <p className="py-8 text-center text-sm text-muted">
            You&apos;ve reached the beginning of it all.
          </p>
        )}
      </div>
    </section>
  );
}
