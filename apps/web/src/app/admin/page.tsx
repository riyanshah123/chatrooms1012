"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, ApiRequestError } from "@/lib/api";
import { Navbar } from "@/components/layout/navbar";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/stores/auth";

interface DayPoint {
  day: string;
  count: number;
}
interface Analytics {
  totals: {
    users: number;
    prompts: number;
    rooms: number;
    messages: number;
    messagesToday: number;
    signupsToday: number;
  };
  live: { peopleInRooms: number; activeRooms: number };
  daily: { signups: DayPoint[]; messages: DayPoint[]; rooms: DayPoint[] };
  topRooms: Array<{ title: string; messages: number; category: string }>;
}

/**
 * Admin dashboard. Staff only, enforced by the API; this page just renders
 * whatever it is allowed to fetch.
 */
export default function AdminPage() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: () => api<Analytics>("/admin/analytics"),
    enabled: status === "authenticated",
    refetchInterval: 30_000, // keep it live while the tab is open
  });

  const forbidden = error instanceof ApiRequestError && error.status === 403;

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-8 sm:px-6 sm:pb-24">
        <h1 className="font-display text-3xl font-bold">Dashboard</h1>
        <p className="mt-1 text-muted">Live numbers from your own database.</p>

        {forbidden && (
          <div className="glass mt-8 p-6">
            <p className="font-semibold">This account is not an admin.</p>
            <p className="mt-1 text-sm text-muted">
              Add your email to the ADMIN_EMAILS environment variable on the API
              service, then redeploy. The seed promotes it on the next boot.
            </p>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-20">
            <Spinner className="size-7" />
          </div>
        )}

        {data && (
          <>
            {/* Right now */}
            <section className="mt-8">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Right now
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="People in rooms" value={data.live.peopleInRooms} highlight />
                <Stat label="Rooms with people" value={data.live.activeRooms} highlight />
                <Stat label="Messages today" value={data.totals.messagesToday} />
                <Stat label="Signups today" value={data.totals.signupsToday} />
              </div>
            </section>

            {/* All time */}
            <section className="mt-8">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                All time
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Accounts" value={data.totals.users} />
                <Stat label="Prompts" value={data.totals.prompts} />
                <Stat label="Rooms" value={data.totals.rooms} />
                <Stat label="Messages" value={data.totals.messages} />
              </div>
            </section>

            {/* Trends */}
            <section className="mt-8 grid gap-4 sm:grid-cols-3">
              <Bars title="Signups / day" points={data.daily.signups} />
              <Bars title="Messages / day" points={data.daily.messages} />
              <Bars title="Prompts / day" points={data.daily.rooms} />
            </section>

            {/* Most talked about */}
            <section className="mt-8">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Most talked about
              </h2>
              <div className="glass mt-3 divide-y divide-border">
                {data.topRooms.length === 0 && (
                  <p className="p-5 text-sm text-muted">No messages yet.</p>
                )}
                {data.topRooms.map((r) => (
                  <div key={r.title} className="flex items-center gap-3 p-3.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {r.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{r.category}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-accent">
                      {r.messages}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="glass p-4">
      <p
        className={`font-display text-3xl font-bold tabular-nums ${
          highlight ? "text-accent" : ""
        }`}
      >
        {value.toLocaleString()}
      </p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  );
}

/** Tiny inline bar chart: enough to see a trend without a chart library. */
function Bars({ title, points }: { title: string; points: DayPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div className="glass p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</p>
      <div className="mt-3 flex h-24 items-end gap-1">
        {points.length === 0 && <p className="text-sm text-muted">No data yet.</p>}
        {points.map((p) => (
          <div
            key={p.day}
            title={`${p.day}: ${p.count}`}
            className="flex-1 rounded-t bg-accent/70 transition-all hover:bg-accent"
            style={{ height: `${Math.max(4, (p.count / max) * 100)}%` }}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        Last {points.length} days, peak {max}
      </p>
    </div>
  );
}
