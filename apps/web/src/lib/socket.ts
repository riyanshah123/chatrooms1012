"use client";

import { io, type Socket } from "socket.io-client";

/**
 * Where to reach the realtime server. Priority:
 *  1. window.__CR_SOCKET_URL__ — injected by the server layout at request time
 *     (the API's public URL). Required in production: WebSocket upgrades can't
 *     be proxied through Next middleware, so the socket goes direct to the API.
 *  2. NEXT_PUBLIC_SOCKET_URL — build-time override.
 *  3. localhost — dev default.
 */
function resolveSocketUrl(): string {
  const injected =
    typeof window !== "undefined"
      ? (window as { __CR_SOCKET_URL__?: string }).__CR_SOCKET_URL__
      : undefined;
  if (injected) return injected;
  const fromEnv = process.env.NEXT_PUBLIC_SOCKET_URL;
  if (fromEnv) return fromEnv;
  return "http://localhost:4000";
}

/**
 * One Socket.IO connection per tab (namespace /chat), shared by every room
 * the user has open. Created lazily on first use; `auth.token` is a
 * callback so reconnects always present the *current* access token —
 * a reconnect after >15 min silently picks up the refreshed JWT.
 */
let socket: Socket | null = null;
let tokenGetter: () => string | null = () => null;

export function configureSocketAuth(getToken: () => string | null): void {
  tokenGetter = getToken;
}

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(`${resolveSocketUrl()}/chat`, {
    // cb form → evaluated on every (re)connect attempt
    auth: (cb) => cb({ token: tokenGetter() }),
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
    autoConnect: true,
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
