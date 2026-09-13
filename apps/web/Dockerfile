# ─────────────────────────────────────────────────────────────────────────────
# Web image — Next.js standalone output, pnpm-workspace-aware.
# Build from the REPO ROOT:
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://chatrooms101.com/api/v1 \
#     --build-arg NEXT_PUBLIC_SOCKET_URL=https://chatrooms101.com .
#
# NEXT_PUBLIC_* vars are baked in at BUILD time (they're inlined into the
# client bundle) — one image per environment, or a same-origin URL scheme
# like the defaults so a single image works everywhere behind the proxy.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /repo

# ── deps ─────────────────────────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --no-frozen-lockfile

# ── build ────────────────────────────────────────────────────────────────────
FROM deps AS build
ARG NEXT_PUBLIC_API_URL=/api/v1
ARG NEXT_PUBLIC_SOCKET_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN cd apps/web && pnpm build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

# Standalone output: server.js + the minimal traced node_modules
COPY --from=build --chown=app:app /repo/apps/web/.next/standalone ./
# Static assets + public files are NOT traced — copy explicitly
COPY --from=build --chown=app:app /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=app:app /repo/apps/web/public ./apps/web/public

USER app
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
