# Chatrooms101 — Folder Structure

Monorepo managed with **pnpm workspaces** + **Turborepo**. Frontend and
backend are separate deployables; `packages/contracts` keeps API/socket
types in one place so the two sides can never drift.

```
chatrooms101/
├── package.json                  # workspace root (scripts, turbo)
├── pnpm-workspace.yaml
├── turbo.json
├── .env.example                  # every env var, documented
├── docker-compose.yml            # local dev: postgres, redis, opensearch, minio
├── docs/
│   ├── ARCHITECTURE.md
│   ├── FOLDER_STRUCTURE.md
│   └── API.md                    # REST endpoint reference (step 7)
│
├── packages/
│   └── contracts/                # shared types — no runtime deps
│       ├── package.json
│       └── src/
│           ├── index.ts
│           ├── enums.ts          # Category, Visibility, roles…
│           ├── dto/              # request/response shapes per resource
│           │   ├── auth.dto.ts
│           │   ├── prompt.dto.ts
│           │   ├── chatroom.dto.ts
│           │   ├── message.dto.ts
│           │   └── search.dto.ts
│           └── socket/
│               ├── events.ts     # event name constants (join_room, …)
│               └── payloads.ts   # typed payload per event
│
├── apps/
│   ├── api/                      # ─────────── NestJS backend ───────────
│   │   ├── package.json
│   │   ├── nest-cli.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts           # categories, starter topics/prompts
│   │   ├── test/                 # e2e tests
│   │   └── src/
│   │       ├── main.ts           # bootstrap: helmet, cors, pipes, adapter
│   │       ├── app.module.ts
│   │       ├── common/           # cross-cutting, no business logic
│   │       │   ├── config/       # typed env config + validation
│   │       │   ├── guards/       # JwtAuthGuard, RolesGuard, ThrottleGuard
│   │       │   ├── decorators/   # @CurrentUser(), @Public(), @Roles()
│   │       │   ├── filters/      # global exception filter → error envelope
│   │       │   ├── interceptors/ # logging, response envelope
│   │       │   ├── pipes/        # zod validation pipe
│   │       │   └── utils/        # cursor codec, id generation
│   │       ├── infra/            # external systems, injected via tokens
│   │       │   ├── prisma/       # PrismaService (pooling, shutdown hooks)
│   │       │   ├── redis/        # RedisService + Lua scripts
│   │       │   ├── s3/           # presigned upload/download
│   │       │   ├── search/       # OpenSearch client + index mappings
│   │       │   └── queue/        # BullMQ queues + worker registration
│   │       └── modules/          # one folder per bounded context
│   │           ├── auth/         # local + Google OAuth, JWT, refresh rotation
│   │           ├── users/        # anonymous profiles, avatars, reputation
│   │           ├── categories/
│   │           ├── topics/       # permanent topic rooms
│   │           ├── prompts/      # user prompts + feed (cursor pagination)
│   │           ├── chatrooms/    # membership, capacity, waiting queue
│   │           ├── messages/     # CRUD, replies, reactions, pins
│   │           ├── chat-gateway/ # Socket.IO gateway (thin — delegates)
│   │           ├── search/       # query + suggest endpoints
│   │           ├── moderation/   # reports, mute/kick, filters, admin
│   │           ├── notifications/
│   │           └── health/       # liveness/readiness for k8s
│   │
│   └── web/                      # ─────────── Next.js frontend ───────────
│       ├── package.json
│       ├── next.config.mjs
│       ├── tailwind.config.ts
│       ├── tsconfig.json
│       ├── Dockerfile
│       ├── public/
│       └── src/
│           ├── app/              # App Router
│           │   ├── layout.tsx    # theme provider, query client, fonts
│           │   ├── page.tsx      # landing: infinite feed + trending
│           │   ├── (auth)/
│           │   │   ├── login/page.tsx
│           │   │   ├── signup/page.tsx
│           │   │   └── onboarding/page.tsx   # pick anonymous username
│           │   ├── topics/page.tsx            # browse topics by category
│           │   ├── room/[id]/page.tsx         # chatroom
│           │   ├── create/page.tsx            # create prompt
│           │   ├── profile/[username]/page.tsx
│           │   ├── search/page.tsx
│           │   └── admin/                     # moderation dashboard
│           ├── components/
│           │   ├── ui/           # buttons, inputs, modal, skeleton, chips
│           │   ├── layout/       # navbar, theme toggle, search command bar
│           │   ├── feed/         # PromptCard, VirtualFeed, TrendingChips
│           │   ├── chat/         # MessageList, Composer, TypingDots,
│           │   │                 # ReactionBar, PinnedBar, MembersDrawer,
│           │   │                 # RoomFullDialog (waiting queue)
│           │   └── profile/
│           ├── hooks/            # useInfiniteFeed, useChatSocket, useDebounce
│           ├── lib/              # api client (fetch wrapper), socket client,
│           │   │                 # auth token manager, query keys
│           ├── stores/           # zustand: auth, theme, chat presence
│           └── styles/globals.css
│
├── infra/
│   ├── nginx/nginx.conf          # reverse proxy, rate limits, WS upgrade
│   ├── k8s/                      # manifests: deployments, services, HPA,
│   │   ├── base/                 # ingress, configmaps, secrets (kustomize)
│   │   └── overlays/{staging,prod}/
│   └── aws/                      # notes + IaC for RDS, ElastiCache, EKS, S3, CF
│
└── .github/workflows/            # CI: lint, test, build, push, deploy
```

### Conventions
- **Module layout (API):** each `modules/*` folder contains
  `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.repository.ts`,
  and `dto/` — controllers stay thin, services hold business rules,
  repositories are the only Prisma consumers (clean-architecture layering).
- **Imports:** `@contracts/*` for shared types, `@/` path alias inside each app.
- **Every list endpoint** returns `{ items, nextCursor }`; every error
  returns `{ error: { code, message, details? } }`.
