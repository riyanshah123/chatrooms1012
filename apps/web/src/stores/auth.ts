"use client";

import { create } from "zustand";
import { api } from "@/lib/api";
import { disconnectSocket } from "@/lib/socket";

export interface SessionProfile {
  id: string;
  username: string;
  avatarUrl: string | null;
}

interface AuthResponse {
  accessToken: string;
  needsOnboarding: boolean;
  profile: SessionProfile | null;
}

export type AuthStatus = "restoring" | "authenticated" | "anonymous";

interface AuthState {
  status: AuthStatus;
  /** Access token lives ONLY in memory — never localStorage (XSS-safe).
   *  Page reloads recover it via the httpOnly refresh cookie. */
  accessToken: string | null;
  profile: SessionProfile | null;
  needsOnboarding: boolean;

  login: (email: string, password: string) => Promise<AuthResponse>;
  signup: (email: string, password: string) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  claimUsername: (username: string) => Promise<void>;
  /** Silent session restore / token refresh. Single-flight: concurrent 401s
   *  from parallel queries share one refresh call. */
  restoreSession: () => Promise<AuthResponse | null>;
}

let refreshInFlight: Promise<AuthResponse | null> | null = null;

export const useAuthStore = create<AuthState>((set, get) => {
  const applySession = (r: AuthResponse) =>
    set({
      status: "authenticated",
      accessToken: r.accessToken,
      profile: r.profile,
      needsOnboarding: r.needsOnboarding,
    });

  return {
    status: "restoring",
    accessToken: null,
    profile: null,
    needsOnboarding: false,

    async login(email, password) {
      const r = await api<AuthResponse>("/auth/login", {
        method: "POST",
        body: { email, password },
        skipAuthRefresh: true,
      });
      applySession(r);
      return r;
    },

    async signup(email, password) {
      const r = await api<AuthResponse>("/auth/signup", {
        method: "POST",
        body: { email, password },
        skipAuthRefresh: true,
      });
      applySession(r);
      return r;
    },

    async logout() {
      try {
        await api("/auth/logout", { method: "POST" });
      } finally {
        disconnectSocket();
        set({ status: "anonymous", accessToken: null, profile: null, needsOnboarding: false });
      }
    },

    async claimUsername(username) {
      await api<{ profile: SessionProfile }>("/auth/username", {
        method: "POST",
        body: { username },
      });
      // The old access token still carries pid=null — rotate the session so
      // the JWT (and socket handshakes) pick up the new profile id.
      const refreshed = await get().restoreSession();
      if (!refreshed) throw new Error("Session expired — log in again.");
    },

    async restoreSession() {
      if (refreshInFlight) return refreshInFlight;
      refreshInFlight = (async () => {
        try {
          // skipAuthRefresh: a 401 here must NOT re-enter the refresh flow.
          const r = await api<AuthResponse>("/auth/refresh", {
            method: "POST",
            skipAuthRefresh: true,
          });
          applySession(r);
          return r;
        } catch {
          set({ status: "anonymous", accessToken: null, profile: null, needsOnboarding: false });
          return null;
        } finally {
          refreshInFlight = null;
        }
      })();
      return refreshInFlight;
    },
  };
});
