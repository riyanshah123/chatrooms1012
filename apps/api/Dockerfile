# ─────────────────────────────────────────────────────────────────────────────
# API image — multi-stage, pnpm-workspace-aware.
# Build from the REPO ROOT:  docker build -f apps/api/Dockerfile .
#
# Stages:
#   deps     workspace install (cached until a lockfile/manifest changes)
#   build    prisma generate + nest build
#   migrate  slim image with the prisma CLI — used by the k8s migration Job
#   runtime  production: dist + pruned prod deps, non-root
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /repo

# ── deps ─────────────────────────────────────────────────────────────────────
FROM base AS deps
# Manifests only → this layer survives source-code changes.
COPY pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --no-frozen-lockfile
# (CI with a committed pnpm-lock.yaml should COPY it above and use --frozen-lockfile.)

# ── build ────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN cd apps/api \
 && pnpm prisma generate \
 && pnpm build
# Self-contained production bundle (prod deps only, workspace links resolved)
RUN pnpm --filter api deploy --prod /out \
 && cp -r apps/api/dist /out/dist \
 # prisma generate wrote the client into the workspace node_modules — make
 # sure the deployed bundle has the generated engines too
 && cd /out && npx prisma generate --schema=prisma/schema.prisma

# ── migrate (run as a Job before each rollout) ──────────────────────────────
FROM base AS migrate
WORKDIR /app
COPY --from=build /repo/apps/api/prisma ./prisma
RUN pnpm add prisma@5 --ignore-workspace
ENTRYPOINT ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Non-root: mitigate container-escape blast radius
RUN addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /out .

USER app
EXPOSE 4000
# Liveness at the process level; k8s probes hit /health/*
CMD ["node", "dist/main.js"]
