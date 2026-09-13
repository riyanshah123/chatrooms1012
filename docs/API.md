# Chatrooms101 — REST API Reference

Base URL: `/api/v1` · All responses are JSON.
Errors: `{ "error": { "code", "message", "details?" } }` with proper status.
Lists: `{ "items": [...], "nextCursor": "..." | null }` — pass `cursor` back to page.
Auth: `Authorization: Bearer <accessToken>` unless marked **public**.

## Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/signup` | **public** · `{ email, password }` → `{ accessToken, needsOnboarding, profile }` + refresh cookie |
| POST | `/auth/login` | **public** · same shape; throttled 10/min |
| GET | `/auth/google` | **public** · redirect to Google consent |
| GET | `/auth/google/callback` | **public** · sets cookie, redirects to web `/auth/callback` |
| POST | `/auth/refresh` | **public** (cookie-authed) · rotates refresh token → new access token |
| POST | `/auth/logout` | **public** · revokes refresh token, clears cookie |
| GET | `/auth/username/suggestions` | 5 generated anonymous names |
| POST | `/auth/username` | one-time claim: `{ username }` → 409 `USERNAME_TAKEN` on conflict |
| GET | `/auth/me` | token introspection: `{ userId, profileId, role }` |

## Feed & Discovery
| Method | Path | Notes |
|---|---|---|
| GET | `/prompts?sort=new\|hot&category=slug&cursor=` | **public** · the infinite feed (15/page) |
| GET | `/prompts/:id` | **public** · single card |
| POST | `/prompts` | create prompt + chatroom; `{ title, categoryId, description?, tags[], maxUsers(2-10), visibility }` · throttled 5/5min |
| POST | `/prompts/:id/bookmark` | toggle → `{ bookmarked }` |
| GET | `/topics?category=slug&cursor=` | **public** · trending-first topic browser |
| GET | `/topics/:slug` | **public** |
| POST | `/topics/:id/favorite` | toggle → `{ favorited }` |
| GET | `/categories` | **public** · cached 5 min |
| GET | `/search?...` | Step 11 (OpenSearch: prompts, topics, usernames + suggest) |

## Chatrooms
| Method | Path | Notes |
|---|---|---|
| GET | `/chatrooms/:id` | room view: members, my seat, queue position, pinned |
| POST | `/chatrooms/:id/join` | take a seat → `{ joined }` · **409 `ROOM_FULL`** `{ details.queueLength }` |
| POST | `/chatrooms/:id/leave` | free seat; next in queue auto-admitted |
| POST | `/chatrooms/:id/queue` | → `{ status: "SEATED" }` or `{ status: "WAITING", position }` |
| DELETE | `/chatrooms/:id/queue` | leave the waiting queue |
| POST | `/chatrooms/:id/kick` | owner/mod/staff · `{ profileId, reason? }` + 10 min rejoin block |
| POST | `/chatrooms/:id/mute` | owner/mod/staff · `{ profileId, minutes, reason? }` |

## Messages (nested under room)
| Method | Path | Notes |
|---|---|---|
| GET | `/chatrooms/:id/messages?cursor=` | newest-first history (40/page), participants only |
| POST | `/chatrooms/:id/messages` | `{ type: TEXT\|GIF, content, gifUrl?, replyToId?, clientNonce? }` — REST fallback; realtime path is the socket |
| PATCH | `/chatrooms/:id/messages/:mid` | edit own message |
| DELETE | `/chatrooms/:id/messages/:mid` | soft-delete own (mods: any) |
| POST | `/chatrooms/:id/messages/:mid/reactions` | toggle `{ emoji }` → `{ added, count }` |
| POST | `/chatrooms/:id/messages/:mid/pin` | mods · `{ pinned }` |
| POST | `/chatrooms/:id/messages/read` | unread pointer `{ messageId }` |

## Profiles & Me
| Method | Path | Notes |
|---|---|---|
| GET | `/profiles/:username` | **public** · anonymous profile + stats + favorite topics |
| GET | `/me/profile` · PATCH `/me/profile` | own profile; update `{ bio?, avatarUrl? }` |
| GET | `/me/bookmarks?cursor=` · GET `/me/rooms` | saved prompts; rooms I'm seated in |

## Notifications & Moderation
| Method | Path | Notes |
|---|---|---|
| GET | `/notifications?cursor=` | + `unreadCount` |
| POST | `/notifications/:id/read` · `/notifications/read-all` | |
| POST | `/reports` | `{ targetType, messageId?/targetProfileId?/promptId?, reason, details? }` |
| GET | `/admin/reports?status=&cursor=` | staff · dashboard queue |
| PATCH | `/admin/reports/:id` | staff · `{ status, resolution? }` |

## Health
`GET /health/live` · `GET /health/ready` — unprefixed, for k8s probes.

## Notable error codes
`ROOM_FULL` (409) · `NOT_A_PARTICIPANT` (403) · `MUTED` (403) ·
`SLOW_DOWN` (429) · `USERNAME_TAKEN` (409) · `REFRESH_REUSED` (401) ·
`TEMPORARILY_BLOCKED` (403, post-kick) · `VALIDATION_FAILED` (400)
