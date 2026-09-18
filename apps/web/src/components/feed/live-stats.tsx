"use client";

import { useQuery } from "@tanstack/react-query";
import { Hash, MessageSquare, Users, Zap } from "lucide-react";
import { api } from "@/lib/api";

export interface PlatformStats {
  activeRooms: number;
  topics: number;
  messagesToday: number;
  users: number;
}

/**
 * Hero counters. Fetched client-side (seeded by SSR) so a cold API doesn't
 * leave a wall of zeros on the page: the browser retries and fills them in
 * once the server wakes up.
 */
export function LiveStats({ initial }: { initial: PlatformStats }) {
  const hasInitial =
    initial.activeRooms + initial.topics + initial.users > 0;

  const { data } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api<PlatformStats>("/stats"),
    initialData: hasInitial ? initial : undefined,
    staleTime: 30_000,
  });

  const stats = data ?? initial;
  const cards = [
    { icon: MessageSquare, value: stats.activeRooms, label: "Active Rooms" },
    { icon: Hash, value: stats.topics, label: "Topics" },
    { icon: Zap, value: stats.messagesToday, label: "Messages Today" },
    { icon: Users, value: stats.users, label: "Users" },
  ];

  return (
    <div className="mt-8 grid w-full max-w-3xl grid-cols-2 gap-3 sm:mt-14 sm:grid-cols-4 sm:gap-4">
      {cards.map((s) => (
        <div
          key={s.label}
          className="glass flex flex-col items-center gap-1 px-3 py-3.5 sm:gap-1.5 sm:px-4 sm:py-5"
        >
          <s.icon size={20} className="text-muted" />
          <span className="font-display text-2xl font-bold tabular-nums sm:text-3xl">
            {data ? s.value : "—"}
          </span>
          <span className="text-xs text-muted sm:text-sm">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
