"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CardSkeleton } from "@/components/ui/skeleton";
import { PromptCard } from "./prompt-card";
import type { FeedPromptCard } from "./prompt-feed";

/**
 * Trending prompts — the highest-traffic discussions right now (ranked by
 * trendScore/message activity on the server). A fixed top-N grid, not an
 * infinite feed, so it stays a compact discovery strip above "For You".
 */
export function TrendingPrompts({ initial }: { initial?: FeedPromptCard[] }) {
  const { data, isLoading } = useQuery({
    queryKey: ["trending-prompts"],
    queryFn: () => api<{ items: FeedPromptCard[] }>("/prompts/trending"),
    initialData: initial ? { items: initial } : undefined,
    staleTime: 30_000,
  });

  const items = data?.items ?? [];
  if (!isLoading && items.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {isLoading
        ? Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)
        : items.map((p) => <PromptCard key={p.id} prompt={p} />)}
    </div>
  );
}
