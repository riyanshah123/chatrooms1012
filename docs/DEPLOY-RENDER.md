# Deploy Chatrooms101 to Render (permanent URL)

Everything is pre-wired in `render.yaml` — Render reads it and provisions
Postgres, Redis, the API, and the web app, connecting them automatically.
You only do the account/repo steps (which need your login).

## 1. Push the repo to GitHub
The repo is already initialised and committed locally on branch `main`.
Create an empty GitHub repo (no README/gitignore), then:

```bash
cd C:/Users/Riyan/Desktop/chatrooms101
git remote add origin https://github.com/<your-username>/chatrooms101.git
git push -u origin main
```

## 2. Deploy on Render
1. Sign up / log in at https://render.com (free; connect your GitHub).
2. **New → Blueprint**.
3. Pick the `chatrooms101` repo. Render detects `render.yaml`.
4. Click **Apply**. Render creates 4 resources:
   - `chatrooms-db` (Postgres)
   - `chatrooms-redis` (Redis)
   - `chatrooms-api` (NestJS, Docker) — runs migrations + seeds on deploy
   - `chatrooms-web` (Next.js, Docker) — the public site
5. First build takes ~5–10 min (Docker builds both apps). Watch the logs.

## 3. Open it
When both services are **Live**, your permanent URL is the web service's:
```
https://chatrooms-web.onrender.com   (or the URL Render shows for chatrooms-web)
```

## What works / notes
- ✅ Feed, Trending, For You, prompts, rooms, realtime chat, email auth.
- ⚠️ Google login: set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` /
  `GOOGLE_CALLBACK_URL` on the API service + add the callback URL in Google
  Cloud Console. Email login works without this.
- ⚠️ Free tier sleeps after 15 min idle (first hit ~30 s to wake). Free
  Postgres is deleted ~30 days after creation — upgrade that one resource to
  keep data long-term.
- Search uses the Postgres fallback (no OpenSearch); media uploads are off
  (no S3). Both are optional and the app runs fine without them.

## If a deploy fails
Open the failing service's **Logs** in Render and paste the error — the most
common first-deploy issues are the Docker build (fixable in the Dockerfile) or
a missing env var. Everything else (DB/Redis URLs, JWT secrets, cross-service
hosts) is wired by the blueprint.

## Alternative: Railway
Railway has smoother service linking and no sleep, but costs ~$5/mo after the
trial. Same repo works: create a project from the GitHub repo, add Postgres +
Redis plugins, and set each service's start the same way `render.yaml` does.
