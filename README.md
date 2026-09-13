# chatrooms101

Anonymous, real-time discussion platform. Scroll an endless feed of
discussion prompts and trending topics; join live **10-person chatrooms**
— always behind an anonymous username. Built to scale to millions of users.

**Stack**: Next.js 14 (App Router) · React · TypeScript · Tailwind ·
Framer Motion · Zustand · React Query — NestJS · Prisma · PostgreSQL ·
Redis · Socket.IO · OpenSearch · S3 — Docker · Kubernetes · Nginx · AWS.

## Quickstart (local)

```bash
# 1. Infra: Postgres, Redis, OpenSearch, MinIO
docker compose up -d

# 2. Install + configure
corepack enable && pnpm install
cp .env.example .env          # fill JWT secrets (openssl rand -base64 48)

# 3. Database
pnpm db:migrate && pnpm db:seed

# 4. Run both apps (api :4000, web :3000)
pnpm dev
```
After seeding, hit `POST /api/v1/admin/search/reindex` (as the seeded
admin) once to make topics/prompts searchable.

**Tests**: `pnpm --filter api test` (unit) ·
`pnpm --filter api test:e2e` (needs the compose stack).

## Repository map

| Path | What |
|---|---|
| `apps/api` | NestJS: REST + Socket.IO gateway + background workers |
| `apps/web` | Next.js: SSR pages, virtualized feed, chat UI |
| `packages/contracts` | Shared DTOs, enums, socket events — the API/UI contract |
| `infra/` | nginx, kustomize (k8s), AWS guide + PgBouncer |
| `docs/` | [ARCHITECTURE](docs/ARCHITECTURE.md) · [API](docs/API.md) · [DEPLOYMENT](docs/DEPLOYMENT.md) · [FOLDER_STRUCTURE](docs/FOLDER_STRUCTURE.md) |

## How the core mechanic works

Seats are enforced **atomically in Redis** (Lua scripts) so two users can't
race into the 10th slot across API pods. A full room offers a FIFO waiting
queue (Redis ZSET, Postgres mirror); when someone leaves — or a sweeper
worker releases a seat abandoned >60 s after disconnect — the next person
is **admitted automatically** and told on their personal socket channel.
Real identity (email/Google) never leaves the auth layer; every public
surface knows only the `AnonymousProfile`.

## Production-readiness checklist

Security
- [x] JWT access (15 m, memory-only) + rotating refresh tokens (httpOnly, hashed, reuse ⇒ family revoke)
- [x] Argon2id passwords · no user enumeration · reserved usernames
- [x] Helmet, strict CORS, SameSite=strict cookie, CSRF-free token placement
- [x] zod validation everywhere · Prisma parameterized queries (SQLi) · plain-text message rendering (XSS)
- [x] 3-layer rate limiting (edge → global guard → per-user burst) · profanity filter · report/mute/kick/admin

Scalability
- [x] Stateless API · Socket.IO Redis adapter · HPA 3→30 (+ gentle scale-down)
- [x] PgBouncer transaction pooling · covering indexes on every cursor path
- [x] Redis caching (feed/topics/search/categories) · counters off the hot path (INCR + rollup worker)
- [x] Keyset pagination + windowed virtualization — no OFFSET, no unbounded DOM
- [x] Lock-guarded workers (sweeper · counters · trend decay) safe at any replica count
- [x] CDN plan (CloudFront: `_next/static` + S3 media via presigned uploads)

Operations
- [x] Liveness ≠ readiness probes · zero-downtime rollouts · PDBs · zone spread
- [x] Migrations as pre-deploy Job · CI (OIDC→AWS): test → build → migrate → deploy
- [x] Config validated at boot (fail fast) · JSON edge logs · graceful SIGTERM drain

Before real traffic (deliberate next investments)
- [ ] Observability: OpenTelemetry traces + Prometheus metrics + Sentry
- [ ] Move fire-and-forget work (search indexing, notifications) onto BullMQ with retries
- [ ] Email verification + password reset flows
- [ ] Room message retention policy + prompt-room archival job
- [ ] Load test the socket layer (k6/artillery) to size pods per 10k connections
