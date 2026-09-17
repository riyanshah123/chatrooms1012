"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";

export interface CategoryChip {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
}

/**
 * Category chips, fetched client-side so they populate even when the SSR pass
 * returned nothing (e.g. the API was cold-starting). SSR data seeds it only
 * when non-empty, avoiding an empty flash when the server already had them.
 */
export function useCategories(initial?: CategoryChip[]) {
  const query = useQuery({
    queryKey: qk.categories,
    queryFn: () => api<{ items: CategoryChip[] }>("/categories"),
    initialData: initial && initial.length ? { items: initial } : undefined,
    staleTime: 300_000,
  });
  return query.data?.items ?? [];
}
