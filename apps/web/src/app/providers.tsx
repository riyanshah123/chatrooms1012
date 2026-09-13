"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AuthBootstrap } from "@/stores/auth-bootstrap";

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
            retry: (failureCount, error) => {
              // Don't retry 4xx — they won't get better.
              const status = (error as { status?: number }).status ?? 0;
              return status >= 500 && failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthBootstrap />
      {children}
    </QueryClientProvider>
  );
}
