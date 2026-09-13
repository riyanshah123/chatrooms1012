"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

/** Result shapes returned by GET /search (Step 11 backend). */
export interface SearchResults {
  prompts: Array<{ id: string; title: string; chatroomId: string; categoryName: string }>;
  topics: Array<{ id: string; title: string; slug: string; chatroomId: string }>;
  users: Array<{ username: string; avatarUrl: string | null }>;
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Search across prompts, topics and usernames with suggest-as-you-type
 * (250 ms debounce; the API's suggest index answers in single-digit ms).
 */
export function SearchView({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const debounced = useDebounced(query.trim(), 250);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const results = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api<SearchResults>(`/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
    placeholderData: (prev) => prev, // keep old results while typing
  });

  const empty =
    results.isSuccess &&
    results.data.prompts.length === 0 &&
    results.data.topics.length === 0 &&
    results.data.users.length === 0;

  return (
    <div>
      <div className="glass flex items-center gap-3 px-4 py-3">
        <SearchIcon size={18} className="text-muted" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search prompts, topics, categories, @usernames…"
          className="w-full bg-transparent text-lg outline-none placeholder:text-muted/60"
        />
      </div>

      <div className="mt-6 space-y-8">
        {results.isFetching && !results.data && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        )}

        {results.isError && (
          <p className="glass p-8 text-center text-muted">
            Search is unavailable right now — try again shortly.
          </p>
        )}

        {empty && (
          <p className="glass p-8 text-center text-muted">
            Nothing found for “{debounced}”.
          </p>
        )}

        {results.data && results.data.prompts.length > 0 && (
          <ResultSection title="Prompts">
            {results.data.prompts.map((p) => (
              <Link
                key={p.id}
                href={`/room/${p.chatroomId}`}
                className="glass flex items-center justify-between p-4 transition hover:border-accent/40"
              >
                <span className="font-medium">{p.title}</span>
                <span className="text-xs text-muted">{p.categoryName}</span>
              </Link>
            ))}
          </ResultSection>
        )}

        {results.data && results.data.topics.length > 0 && (
          <ResultSection title="Topics">
            {results.data.topics.map((t) => (
              <Link
                key={t.id}
                href={`/room/${t.chatroomId}`}
                className="glass flex items-center justify-between p-4 transition hover:border-accent/40"
              >
                <span className="font-medium">{t.title}</span>
                <span className="text-xs text-muted">permanent room</span>
              </Link>
            ))}
          </ResultSection>
        )}

        {results.data && results.data.users.length > 0 && (
          <ResultSection title="People">
            {results.data.users.map((u) => (
              <Link
                key={u.username}
                href={`/profile/${u.username}`}
                className="glass flex items-center gap-3 p-4 transition hover:border-accent/40"
              >
                <Avatar username={u.username} src={u.avatarUrl} size={32} />
                <span className="font-medium">@{u.username}</span>
              </Link>
            ))}
          </ResultSection>
        )}
      </div>
    </div>
  );
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
