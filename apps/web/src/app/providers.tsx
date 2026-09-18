"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AuthBootstrap } from "@/stores/auth-bootstrap";
import { RoomAlerts } from "@/components/layout/room-alerts";

/**
 * Client-side providers. The QueryClient is created inside state so SSR
 * never shares a cache between users. AuthBootstrap (Step 10) wires the
 * api client to the auth store and attempts one silent session restore.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            // Retry server/gateway errors persistently — on free hosting the
            // API cold-starts (~45s) and the proxy returns 502/503 until it's
            // awake. ~8 attempts with backoff rides that out. 4xx never retries.
            retry: (failureCount, error) => {
              const status = (error as { status?: number }).status ?? 0;
              return (status >= 500 || status === 0) && failureCount < 8;
            },
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthBootstrap />
      {children}
      <RoomAlerts />
    </QueryClientProvider>
  );
}
