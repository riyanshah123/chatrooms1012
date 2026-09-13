"use client";

import { io, type Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000";

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
  socket = io(`${SOCKET_URL}/chat`, {
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
