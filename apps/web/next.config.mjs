import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Monorepo: trace files from the workspace root so the standalone output
  // bundles hoisted node_modules correctly (Docker runtime copies only this).
  // (Top-level in Next 15; experimental in 14.)
  experimental: {
    outputFileTracingRoot: path.join(__dirname, "../../"),
  },
  reactStrictMode: true,
  // The contracts package ships raw TS — let Next transpile it.
  transpilePackages: ["@chatrooms/contracts"],
  images: {
    // GIF providers + S3/CloudFront media. next/image optimizes and lazy-loads.
    remotePatterns: [
      { protocol: "https", hostname: "media.giphy.com" },
      { protocol: "https", hostname: "media.tenor.com" },
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "**.cloudfront.net" },
    ],
  },
  // Standalone output → minimal Docker image (Step 16).
  output: "standalone",
  poweredByHeader: false,
  // Optional same-origin proxy: when WEB_API_PROXY is set (e.g. local dev or
  // sharing via a single tunnel), Next forwards /api and /socket.io to the
  // API so the whole app is one origin. Unset in prod (nginx handles routing).
  rewrites: async () => {
    const raw = process.env.WEB_API_PROXY;
    if (!raw) return [];
    // Accept a full URL or a bare host (Render blueprint gives a hostname).
    const target = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
    return [
      { source: "/api/:path*", destination: `${target}/api/:path*` },
      { source: "/socket.io/:path*", destination: `${target}/socket.io/:path*` },
    ];
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    },
  ],
};

export default nextConfig;
