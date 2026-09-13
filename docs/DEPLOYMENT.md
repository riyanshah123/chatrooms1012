# Chatrooms101 — Deployment Guide

Four rungs, each building on the previous. Steps 16–18 provide the files;
this doc is the map.

| Rung | What | Files |
|---|---|---|
| 1. Local dev | compose for infra, apps on host | `docker-compose.yml` |
| 2. Full containers | both apps + infra in Docker | `apps/*/Dockerfile`, `docker-compose.prod.yml` |
| 3. Kubernetes | EKS/any k8s with kustomize overlays | `infra/k8s/**` |
| 4. AWS production | managed services + CDN | `infra/aws/**` |

---

## Traffic topology (production)

```
                    Route 53 (DNS)
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
   CloudFront (CDN)              ALB / Nginx ingress
   _next/static, S3 media        TLS · WAF · rate limits
          │                             │
          ▼                   ┌─────────┴─────────┐
      S3 bucket               ▼                   ▼
                        web pods (SSR)      api pods (REST+WS)
                        HPA 2→N             HPA 3→N, ip_hash for
                                            polling fallback only
                                            │
                              ┌─────────────┼─────────────┐
                              ▼             ▼             ▼
                        RDS Postgres   ElastiCache    OpenSearch
                        (PgBouncer)      Redis          Service
```

## Edge policy (implemented in `infra/nginx/nginx.conf`)

- **TLS 1.2/1.3 only**, HSTS, no server tokens.
- **Rate limits**: 20 r/s per IP general (burst 60), 3 r/s on `/api/v1/auth/*`
  (burst 6) — the outermost of three layers (edge → Nest ThrottlerGuard →
  per-user Redis buckets on hot endpoints).
- **WebSockets**: `/socket.io/` upgraded with 75 s read timeouts
  (> Socket.IO's ping cycle). `ip_hash` stickiness exists solely for the
  HTTP-polling fallback handshake; WebSocket traffic is pod-agnostic thanks
  to the Redis adapter.
- **Caching**: `/_next/static/*` marked immutable (1 y) — CloudFront and
  browsers cache it; HTML is never edge-cached (SSR + auth).

## Scaling model

- **api**: stateless — all shared state in Postgres/Redis. Scale on CPU +
  socket connection count. Workers (sweeper/counters) are safe at any
  replica count via Redis NX locks.
- **web**: stateless SSR. Scale on CPU/RPS.
- **Postgres**: vertical first; read replicas for feed/history reads when
  needed (Prisma read-replica extension). PgBouncer keeps connection totals
  flat as pods scale.
- **Redis**: single primary → ElastiCache cluster mode when pub/sub volume
  or memory demands it (Socket.IO adapter supports cluster via sharded
  pub/sub).
- **OpenSearch**: 3 nodes minimum in prod (quorum), 1 replica per index.

## Configuration & secrets

Everything ships via environment (`.env.example` is the contract; zod
validates at boot and the pod crash-loops on bad config rather than
serving misconfigured). In k8s: ConfigMap for the boring values, Secret
(or External Secrets → AWS Secrets Manager) for `DATABASE_URL`, JWT
secrets, Google OAuth, S3 keys.

## Rollout & health

- Probes: `/health/live` (process up — no dependency checks, so a flaky
  dependency can't restart-loop pods) and `/health/ready` (DB + Redis
  reachable — failing removes the pod from load balancing only).
- Deploys: RollingUpdate, maxUnavailable 0 / maxSurge 1. The API handles
  SIGTERM by finishing in-flight requests (enableShutdownHooks);
  disconnected sockets auto-reconnect to surviving pods and re-subscribe
  their rooms (client re-emits join_room on connect).
- Migrations: `prisma migrate deploy` as a pre-deploy job — additive
  migrations first, destructive changes only after the old code is gone.
