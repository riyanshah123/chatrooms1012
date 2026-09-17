"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Hash } from "lucide-react";
import type { Paginated } from "@chatrooms/contracts";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import type { TopicCardData } from "./trending-topics";

/**
 * Compact, horizontally scrolling row of permanent topic rooms.
 *
 * Lives high on the landing page on purpose: the prompt feed below it scrolls
 * forever, so anything placed after it is effectively unreachable. This keeps
 * topics one glance away without taking over the page.
 */
export function TopicsStrip({ initial }: { initial?: TopicCardData[] }) {
  const { data, isLoading } = useQuery({
    queryKey: ["topics", null],
    queryFn: () => api<Paginated<TopicCardData>>("/topics"),
    initialData:
      initial && initial.length ? { items: initial, nextCursor: null } : undefined,
    staleTime: 60_000,
  });

  const items = (data?.items ?? []).slice(0, 12);

  return (
    <section className="pt-4" aria-label="Topic rooms">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
            <Hash size={22} className="text-accent" />
            Topic Rooms
          </h2>
          <p className="mt-1 text-sm text-muted">
            Always open rooms for the big subjects. Jump into any of them.
          </p>
        </div>
        <Link
          href="/topics"
          className="shrink-0 whitespace-nowrap text-sm font-semibold text-accent hover:underline"
        >
          See all
        </Link>
      </div>

      {/* Horizontal rail. Scrollbar hidden, snap points so it feels deliberate. */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
        {isLoading && !items.length
          ? Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-56 shrink-0 rounded-2xl" />
            ))
          : items.map((t) => (
              <Link
                key={t.id}
                href={`/room/${t.chatroomId}`}
                className="glass group flex w-56 shrink-0 snap-start flex-col justify-between p-4 transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
              >
                <span className="pill w-fit">
                  {t.category.icon} {t.category.name}
                </span>
                <span className="mt-3 font-display font-semibold leading-snug transition-colors group-hover:text-accent">
                  {t.title}
                </span>
                <span className="mt-2 flex items-center gap-1 text-xs font-medium text-accent">
                  Open room
                  <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}

        {/* Tail card into the full browser */}
        {items.length > 0 && (
          <Link
            href="/topics"
            className="flex w-40 shrink-0 snap-start flex-col items-center justify-center rounded-2xl border border-dashed border-border text-sm font-medium text-muted transition hover:border-accent/50 hover:text-accent"
          >
            Browse all topics
            <ArrowRight size={15} className="mt-1" />
          </Link>
        )}
      </div>
    </section>
  );
}
