"use client";

import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Paginated } from "@chatrooms/contracts";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { useCategories } from "@/hooks/use-categories";

export interface TopicCardData {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  category: { slug: string; name: string; icon: string | null };
  chatroomId: string;
  isTrending: boolean;
  createdAt: string;
}

interface CategoryChip {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
}

/**
 * Trending Topics: category chips + permanent-room cards. Used on the
 * landing page (compact) and as the /topics browser (standalone).
 * Chip clicks refetch the filtered list client-side; SSR data seeds the
 * unfiltered view.
 */
export function TrendingTopics({
  initialPage,
  categories: initialCategories,
  initialCategory,
  standalone = false,
}: {
  initialPage: Paginated<TopicCardData>;
  categories: CategoryChip[];
  initialCategory?: string;
  standalone?: boolean;
}) {
  const [category, setCategory] = useState<string | null>(initialCategory ?? null);
  const categories = useCategories(initialCategories);

  // There are hundreds of topics; the API pages them 20 at a time, so this
  // keeps pulling as the reader scrolls instead of stopping at the first page.
  const { data, isFetching, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteQuery({
      queryKey: ["topics", category],
      queryFn: ({ pageParam, signal }) => {
        const params = new URLSearchParams();
        if (category) params.set("category", category);
        if (pageParam) params.set("cursor", pageParam);
        const qs = params.toString();
        return api<Paginated<TopicCardData>>(`/topics${qs ? `?${qs}` : ""}`, { signal });
      },
      initialPageParam: "",
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      // Don't adopt an empty SSR page as final (API may have been cold).
      initialData:
        category === (initialCategory ?? null) && initialPage.items.length > 0
          ? { pages: [initialPage], pageParams: [""] }
          : undefined,
      staleTime: 60_000,
    });

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  // Pull the next page as the sentinel nears the viewport.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <section aria-label="Trending topics" className={standalone ? "mt-8" : "mt-16"}>
      {!standalone && (
        <div className="mb-5">
          <h2 className="font-display text-3xl font-bold tracking-tight">Browse Topics</h2>
          <p className="mt-1 text-muted">Permanent rooms for the biggest conversations.</p>
        </div>
      )}

      {/* Category chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none]">
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

      {/* Topic cards */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isFetching && items.length === 0
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)
          : items.map((t, i) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.25, delay: (i % 6) * 0.04 }}
              >
                <Link
                  href={`/room/${t.chatroomId}`}
                  className="glass block h-full p-5 transition hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5"
                >
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>
                      {t.category.icon} {t.category.name}
                    </span>
                    {t.isTrending && (
                      <span className="flex items-center gap-1 text-accent">
                        <Flame size={12} /> trending
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 font-display font-semibold">{t.title}</h3>
                  <p className="mt-1 text-xs text-muted">Permanent room · always open</p>
                </Link>
              </motion.div>
            ))}
      </div>

      {isFetchingNextPage && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}

      <div ref={sentinelRef} aria-hidden className="h-px" />

      {items.length === 0 && !isFetching && (
        <p className="glass mt-4 p-8 text-center text-muted">
          No topics in this category yet.
        </p>
      )}

      {!hasNextPage && items.length > 0 && (
        <p className="py-8 text-center text-sm text-muted">
          That&apos;s every topic.
        </p>
      )}
    </section>
  );
}
