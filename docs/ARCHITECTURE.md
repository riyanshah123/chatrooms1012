# Chatrooms101 — System Architecture

> Anonymous, real-time discussion platform. Users scroll an infinite feed of
> discussion prompts and trending topics, and join live 10-person chatrooms —
> always behind an anonymous username.

---

## 1. High-Level Overview

```
                                ┌─────────────────────────┐
                                │        CloudFront CDN    │
                                │  (static assets, images) │
                                └────────────┬────────────┘
                                             │
┌──────────┐   HTTPS    ┌───────────────────▼────────────────────┐
│  Browser  │──────────▶│              Nginx / ALB               │
│ (Next.js) │◀──────────│   TLS termination · rate limiting ·    │
└──────────┘  WSS       │   sticky sessions for WebSockets       │
                        └───────┬────────────────────┬───────────┘
                                │                    │
                 ┌──────────────▼─────┐   ┌──────────▼─────────────┐
                 │   Next.js (SSR)    │   │   NestJS API cluster    │
                 │   apps/web         │   │   apps/api (stateless,  │
                 │   Node runtime     │   │   N replicas)           │
                 └────────────────────┘   └──┬──────┬──────┬───────┘
                                             │      │      │
                      ┌──────────────────────┘      │      └──────────────┐
                      ▼                             ▼                     ▼
             ┌────────────────┐          ┌──────────────────┐   ┌─────────────────┐
             │  PostgreSQL    │          │      Redis        │   │  OpenSearch     │
             │  (RDS, primary │          │  (ElastiCache)    │   │  (search index: │
             │   + replicas)  │          │  cache · pub/sub  │   │  prompts/topics │
             │  via Prisma +  │          │  socket adapter · │   │  /usernames)    │
             │  PgBouncer     │          │  presence · queues│   └─────────────────┘
             └────────────────┘          └──────────────────┘
                      ▲                             ▲
                      │                             │
             ┌────────┴─────────────────────────────┴────────┐
             │        BullMQ workers (apps/api worker mode)   │
             │  fan-out notifications · search indexing ·     │
             │  spam/profanity scoring · counters rollup      │
             └────────────────────────────────────────────────┘

             ┌────────────────┐
             │     AWS S3     │  avatars · GIF/media uploads (presigned URLs)
             └────────────────┘
```

Two deployable applications, one shared contracts package:

| App / Package        | Role                                                        |
| -------------------- | ----------------------------------------------------------- |
| `apps/web`           | Next.js 14 App Router — SSR/ISR pages, UI, socket client    |
| `apps/api`           | NestJS — REST API, Socket.IO gateway, BullMQ workers        |
| `packages/contracts` | Shared TypeScript types: DTOs, socket event names, enums    |

Frontend and backend are **fully separated** — they communicate only via the
REST API and WebSockets, so each scales, deploys, and fails independently.

---

## 2. Core Design Decisions

### 2.1 Stateless API, horizontal scaling
- No in-process session state. JWT access tokens (15 min, in memory on the
  client) + rotating refresh tokens (httpOnly secure cookie, persisted+hashed
  in Postgres so they can be revoked).
- Any API replica can serve any request → scale with a Kubernetes HPA.
- Socket.IO uses the **Redis adapter** so events published on one pod reach
  clients connected to any other pod. Sticky sessions (by cookie) are only
  needed for the HTTP long-polling fallback handshake.

### 2.2 Real-time model
- One Socket.IO namespace `/chat`; each chatroom is a Socket.IO **room**.
- Presence (online users, typing) lives in Redis with TTL keys — never in
  Postgres. Postgres stores durable facts only (membership, messages).
- Room capacity (max 10) is enforced **atomically in Redis** with a Lua
  script (check-count-and-add in one round trip) to avoid race conditions
  when two users join simultaneously. Postgres `Participant` rows are the
  durable record, written after Redis admits the user.
- Waiting queue = Redis sorted set per room (score = enqueue timestamp).
  On `leave_room`, the API pops the head of the queue, admits that user,
  and emits `queue_admitted` to them.

### 2.3 Feed & pagination
- All lists (feed, messages, search results) use **cursor-based pagination**
  (opaque cursor = base64 of `createdAt + id`) — stable under inserts,
  index-friendly, no OFFSET scans.
- Hot feed pages cached in Redis (30–60 s TTL) since the first pages are
  read by every visitor.
- Live counters (online users, message counts) are Redis counters, rolled
  up into Postgres periodically by a worker — the feed never does
  `COUNT(*)` per card.

### 2.4 Search
- OpenSearch index per entity type (`prompts`, `topics`, `users`).
- Write path: Postgres is source of truth → outbox-style BullMQ job indexes
  the document (search is eventually consistent, ~1 s).
- Autocomplete uses `search_as_you_type` fields; full search uses multi-match
  with category filters.

### 2.5 Anonymity model
- `User` (real identity: email, Google ID, hashed password) is **never**
  exposed by any public endpoint.
- `AnonymousProfile` (1-to-1 with User) holds the public username, avatar,
  reputation. All chat/feed/profile payloads reference the profile id only.
- Moderation/admin endpoints are the sole surface that can join the two,
  gated by role checks and audit-logged.

### 2.6 Moderation
- Ingest pipeline for every message: profanity filter (word list +
  normalization against leet-speak) runs synchronously; spam heuristics
  (rate, duplication, link density) run in a worker and can retro-hide.
- Reports create `Report` rows and notify the admin dashboard.
- Room creators + admins can mute (Redis TTL key blocks publishing) and
  kick (removes participant, emits `user_kicked`, admits next in queue).

### 2.7 Microservice-ready modularity
The API is a **modular monolith**: each NestJS module (auth, feed, chat,
search, moderation, notifications) owns its controllers/services/repositories
and communicates with siblings through injected service interfaces — so any
module can later be extracted into its own service with a queue or RPC
boundary without rewriting business logic.

---

## 3. Scalability Checklist (how each requirement is met)

| Requirement            | Implementation                                                    |
| ---------------------- | ----------------------------------------------------------------- |
| Redis caching          | Feed pages, topic lists, session/presence, hot counters           |
| Horizontal scaling     | Stateless API pods + HPA; Socket.IO Redis adapter                 |
| Load balancer          | ALB/Nginx, health checks on `/health`, WS-aware                   |
| Stateless backend      | JWT + Redis/Postgres-backed state only                            |
| CDN                    | CloudFront for `_next/static`, images, S3 media                   |
| DB indexing            | Covering indexes on every cursor + FK (see schema)                |
| Connection pooling     | PgBouncer (transaction mode) in front of RDS                      |
| Rate limiting          | Nginx zone limits + per-user Redis token bucket in API guard      |
| Message queues         | BullMQ (Redis) for indexing, notifications, moderation, rollups   |
| Socket scaling         | Redis adapter, room-scoped emits, presence in Redis               |
| Optimistic UI          | React Query mutations with rollback; socket reconciliation        |

---

## 4. Request Lifecycles (reference flows)

**Join room:** `POST /api/v1/chatrooms/:id/join` → auth guard → Redis Lua
capacity check → *admitted*: insert `Participant`, emit `user_joined` →
*full*: return `409 ROOM_FULL` with queue offer → `POST /queue` adds to
sorted set, emits `waiting_queue` position updates.

**Send message:** socket `new_message` → zod-validated payload → mute/rate
checks → profanity filter → insert `Message` → emit to room → enqueue
spam-scan + counter-increment jobs → sender reconciles optimistic message
via `clientNonce`.

**Feed page:** `GET /api/v1/prompts?cursor=...` → Redis cache hit? return →
else Prisma keyset query (~20 rows) + counter hydration from Redis → cache
30 s → return `{ items, nextCursor }`.

---

## 5. Environments

| Env     | Infra                                                        |
| ------- | ------------------------------------------------------------ |
| local   | docker-compose: Postgres, Redis, OpenSearch, MinIO (S3), api, web |
| staging | Single k8s namespace, small RDS/ElastiCache                  |
| prod    | EKS multi-AZ, RDS Multi-AZ + read replicas, ElastiCache cluster mode, OpenSearch 3-node, CloudFront + S3 |
