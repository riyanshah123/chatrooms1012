import type { ApiError } from "@chatrooms/contracts";

/**
 * Isomorphic API client.
 *  - Server components call `serverFetch` (public endpoints, per-request
 *    Next.js caching via `revalidate`).
 *  - Client code calls `api` — it attaches the in-memory access token and,
 *    on 401, runs one silent refresh (cookie-based) and retries once.
 * Token storage/refresh orchestration lives in the auth store (Step 10);
 * this module only holds injected callbacks so it stays dependency-free.
 */

// Browser calls: may be relative (/api/v1) for same-origin, resolved by the
// browser against the page origin.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

// Server (SSR) calls: Node's fetch can't resolve a relative URL, so we need an
// absolute base. Prefer the internal proxy target; else a public absolute URL;
// else localhost. (WEB_API_PROXY is a server-only var — never sent to the browser.)
const proxyBase = process.env.WEB_API_PROXY
  ? (/^https?:\/\//.test(process.env.WEB_API_PROXY)
      ? process.env.WEB_API_PROXY
      : `https://${process.env.WEB_API_PROXY}`
    ).replace(/\/$/, "")
  : null;
const SERVER_API_URL = proxyBase
  ? `${proxyBase}/api/v1`
  : API_URL.startsWith("http")
    ? API_URL
    : "http://localhost:4000/api/v1";

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function parseError(res: Response): Promise<ApiRequestError> {
  try {
    const body = (await res.json()) as ApiError;
    return new ApiRequestError(
      res.status,
      body.error.code,
      body.error.message,
      body.error.details,
    );
  } catch {
    return new ApiRequestError(res.status, "HTTP_ERROR", res.statusText);
  }
}

// ── Client-side auth hooks (wired by the auth store) ──────────────────────

let getToken: () => string | null = () => null;
let refreshToken: () => Promise<string | null> = async () => null;

export function configureApiAuth(opts: {
  getToken: () => string | null;
  refreshToken: () => Promise<string | null>;
}): void {
  getToken = opts.getToken;
  refreshToken = opts.refreshToken;
}

interface RequestOpts {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

/** Client-side request with auth + single silent-refresh retry. */
export async function api<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const doFetch = (token: string | null) =>
    fetch(`${API_URL}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        ...(opts.body !== undefined && { "Content-Type": "application/json" }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "include", // refresh cookie rides along to /auth/*
      signal: opts.signal,
    });

  let res = await doFetch(getToken());

  if (res.status === 401) {
    const fresh = await refreshToken();
    if (fresh) res = await doFetch(fresh);
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Server-component fetch for public endpoints (feed SSR, profiles…). */
export async function serverFetch<T>(
  path: string,
  init?: { revalidate?: number },
): Promise<T> {
  const res = await fetch(`${SERVER_API_URL}${path}`, {
    next: { revalidate: init?.revalidate ?? 30 },
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}
