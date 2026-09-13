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
  // Same-origin API proxy is handled at runtime in src/middleware.ts (Next's
  // next.config rewrites are baked at build time, before WEB_API_PROXY is known).
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
