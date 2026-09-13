"use client";

import { useEffect } from "react";
import { configureApiAuth } from "@/lib/api";
import { configureSocketAuth } from "@/lib/socket";
import { useAuthStore } from "./auth";

/**
 * Mounted once inside Providers. Wires the api client's auth hooks to the
 * store and kicks off the one silent session restore per page load.
 * (A component rather than module side effects so it runs client-only,
 * after hydration.)
 */
export function AuthBootstrap() {
  const restore = useAuthStore((s) => s.restoreSession);

  useEffect(() => {
    configureApiAuth({
      getToken: () => useAuthStore.getState().accessToken,
      refreshToken: async () => {
        const session = await useAuthStore.getState().restoreSession();
        return session?.accessToken ?? null;
      },
    });
    configureSocketAuth(() => useAuthStore.getState().accessToken);
    void restore();
  }, [restore]);

  return null;
}
