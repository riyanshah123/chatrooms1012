"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Hash, MessageSquare, Search as SearchIcon, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Avatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import type { SearchResults } from "./search-view";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Command-palette search overlay. Opens from the navbar (or ⌘K / Ctrl-K),
 * queries as you type, and shows grouped live results — no page navigation
 * until you pick something.
 */
export function SearchCommand({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim(), 200);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input when opened; reset when closed.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 40);
    else setQuery("");
  }, [open]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const results = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api<SearchResults>(`/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const go = (path: string) => {
    onClose();
    router.push(path);
  };

  const data = results.data;
  const hasResults =
    data && (data.prompts.length || data.topics.length || data.users.length);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.div
            className="glass w-full max-w-xl overflow-hidden p-0"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Input */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
              <SearchIcon size={18} className="shrink-0 text-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search prompts, topics, @people…"
                className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted/70"
              />
              {results.isFetching && <Spinner className="size-4" />}
            </div>

            {/* Results */}
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {debounced.length < 2 ? (
                <p className="px-3 py-8 text-center text-sm text-muted">
                  Type at least two letters to search.
                </p>
              ) : hasResults ? (
                <>
                  <Group label="Prompts" show={!!data!.prompts.length}>
                    {data!.prompts.map((p) => (
                      <Row key={p.id} onClick={() => go(`/prompt/${p.id}`)} icon={<MessageSquare size={16} />}>
                        <span className="truncate">{p.title}</span>
                        <span className="ml-auto shrink-0 text-xs text-muted">{p.categoryName}</span>
                      </Row>
                    ))}
                  </Group>
                  <Group label="Topics" show={!!data!.topics.length}>
                    {data!.topics.map((t) => (
                      <Row key={t.id} onClick={() => go(`/room/${t.chatroomId}`)} icon={<Hash size={16} />}>
                        <span className="truncate">{t.title}</span>
                        <span className="ml-auto shrink-0 text-xs text-muted">room</span>
                      </Row>
                    ))}
                  </Group>
                  <Group label="People" show={!!data!.users.length}>
                    {data!.users.map((u) => (
                      <Row
                        key={u.username}
                        onClick={() => go(`/profile/${u.username}`)}
                        icon={<Avatar username={u.username} src={u.avatarUrl} size={20} />}
                      >
                        <span className="truncate">@{u.username}</span>
                      </Row>
                    ))}
                  </Group>
                </>
              ) : results.isSuccess ? (
                <p className="px-3 py-8 text-center text-sm text-muted">
                  Nothing found for “{debounced}”.
                </p>
              ) : (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Group({ label, show, children }: { label: string; show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <div className="mb-1">
      <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      {children}
    </div>
  );
}

function Row({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-2"
    >
      <span className="flex size-5 shrink-0 items-center justify-center text-muted">{icon}</span>
      {children}
    </button>
  );
}
