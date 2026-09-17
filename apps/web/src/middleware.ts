import { NextResponse, type NextRequest } from "next/server";

/**
 * Runtime API proxy. Next's next.config `rewrites` are frozen at build time,
 * but the API's address (WEB_API_PROXY) is only known at runtime on the host —
 * so we proxy /api and /socket.io here in middleware, which reads env at
 * request time. This keeps the browser on one origin (cookies work, no CORS).
 */
// Only REST is proxied. Socket.IO connects straight to the API (see
// lib/socket.ts) because middleware cannot proxy WebSocket upgrades.
export const config = {
  matcher: ["/api/:path*"],
};

export function middleware(req: NextRequest) {
  const raw = process.env.WEB_API_PROXY;
  if (!raw) return NextResponse.next();
  const base = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  const target = new URL(req.nextUrl.pathname + req.nextUrl.search, base);
  return NextResponse.rewrite(target);
}
