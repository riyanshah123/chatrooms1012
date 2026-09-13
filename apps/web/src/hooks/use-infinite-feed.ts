"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Paginated } from "@chatrooms/contracts";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { FeedPromptCard } from "@/components/feed/prompt-feed";

/**
 * Cursor-paginated prompt feed as a hook.
 *  - `initialPage` (from SSR) seeds the default view — zero client refetch
 *    on first paint.
 *  - Pages accumulate in the query cache; `items` is the flattened list.
 *  - Switching sort/category is just a key change — React Query keeps each
 *    variant cached, so flipping back is instant.
 */
export function useInfiniteFeed(opts: {
  sort: "new" | "hot";
  category: string | null;
  initialPage?: Paginated<FeedPromptCard>;
  /** When true, hit the personalized /prompts/for-you endpoint (needs auth). */
  personalized?: boolean;
}) {
  const basePath = opts.personalized ? "/prompts/for-you" : "/prompts";

  const query = useInfiniteQuery({
    queryKey: [opts.personalized ? "for-you" : "feed", opts.sort, opts.category],
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ sort: opts.sort });
      if (opts.category) params.set("category", opts.category);
      if (pageParam) params.set("cursor", pageParam);
      return api<Paginated<FeedPromptCard>>(`${basePath}?${params}`, { signal });
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // Only the generic (non-personalized) newest view matches the SSR page.
    initialData:
      opts.initialPage && !opts.personalized && opts.sort === "new" && !opts.category
        ? { pages: [opts.initialPage], pageParams: [""] }
        : undefined,
    staleTime: 30_000,
  });

  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );

  return {
    items,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage ?? false,
    fetchNextPage: query.fetchNextPage,
  };
}
