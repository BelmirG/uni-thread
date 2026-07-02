# Deploying IUSConnect to Railway

This guide takes the app from your local machine to a live, public URL that real IUS
students can register on. It targets **Railway** (managed Postgres + Redis, WebSocket
support, deploys from GitHub). Email is sent through **Brevo** (free tier).

Everything below is a one-time setup. After it's done, every `git push` to `main`
redeploys automatically.

---

## Architecture on Railway

Railway runs each part as its own **service**, all in one project:

```
                    ┌─────────────────────────────┐
  student's phone → │  frontend  (Next.js)         │  app.yourdomain
                    │  - serves the UI             │
                    │  - proxies /api + /uploads ──┼──► backend (private network)
                    └─────────────────────────────┘
                    ┌─────────────────────────────┐
        WebSockets →│  backend  (FastAPI)          │  api.yourdomain
                    │  - REST API + WebSockets     │
                    │  - runs DB migrations on boot│──► Postgres, Redis (private)
                    │  - stores uploads on volume  │
                    └─────────────────────────────┘
```

Why two public domains? Next.js's proxy forwards normal HTTP fine, but **not**
WebSocket upgrades. So live chat connects the browser straight to the backend at
`api.yourdomain`. The login cookie is issued for the shared parent domain
(`.yourdomain`) so it's sent to both — that's what `COOKIE_DOMAIN` below is for.

---

## Prerequisites

1. A **GitHub repo** with this code (already set up).
2. A **Railway account** (railway.app — sign in with GitHub).
3. A **domain** you own (e.g. `iusconnect.ba`). Railway also gives every service a
   free `*.up.railway.app` URL you can use to test before the domain is ready.
4. A **Brevo account** (brevo.com) for sending email — free tier, 300 emails/day.

---

## Step 1 — Create the project and databases

1. In Railway: **New Project → Deploy from GitHub repo →** pick this repo.
2. Add **Postgres**: in the project, **New → Database → Add PostgreSQL**.
3. Add **Redis**: **New → Database → Add Redis**.

Railway auto-creates `DATABASE_URL` and `REDIS_URL` connection strings you'll
reference below. (The backend auto-converts the `postgresql://` URL to the async
driver it needs — no manual editing.)

## Step 2 — Deploy the backend service

1. **New → GitHub Repo →** this repo. In the service **Settings**:
   - **Root Directory:** `backend`
   - Railway detects the `Dockerfile` automatically.
2. Add a **Volume** (Settings → Volumes) mounted at **`/data`** — this persists
   uploaded photos and files across redeploys.
3. Set **Variables** (Settings → Variables):

   | Variable | Value |
   |----------|-------|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference the Postgres service) |
   | `REDIS_URL` | `${{Redis.REDIS_URL}}` (reference the Redis service) |
   | `SECRET_KEY` | a long random string — generate with `python3 -c "import secrets;print(secrets.token_urlsafe(48))"` |
   | `ADMIN_KEY` | another random string — `python3 -c "import secrets;print(secrets.token_urlsafe(24))"` |
   | `ENVIRONMENT` | `production` |
   | `DATA_DIR` | `/data` |
   | `PUBLIC_BASE_URL` | `https://app.yourdomain` (the frontend URL) |
   | `CORS_ORIGINS` | `https://app.yourdomain` |
   | `COOKIE_DOMAIN` | `.yourdomain` (leading dot — shared across app + api) |
   | `SMTP_HOST` | `smtp-relay.brevo.com` |
   | `SMTP_PORT` | `587` |
   | `SMTP_USER` | your Brevo SMTP login (from Step 5) |
   | `SMTP_PASSWORD` | your Brevo SMTP key (from Step 5) |
   | `SMTP_FROM` | `IUSConnect <no-reply@yourdomain>` |

   > With `ENVIRONMENT=production` the backend **refuses to start** if `SECRET_KEY`
   > or `ADMIN_KEY` is still a placeholder — that's intentional.

## Step 3 — Deploy the frontend service

1. **New → GitHub Repo →** this repo again. In **Settings**:
   - **Root Directory:** `frontend`
2. Set **Variables**:

   | Variable | Value |
   |----------|-------|
   | `BACKEND_URL` | the backend's **private** URL, e.g. `http://backend.railway.internal:8000` (Railway shows it under the backend service's networking) |
   | `NEXT_PUBLIC_WS_ORIGIN` | `https://api.yourdomain` (the public backend URL — used for WebSockets) |

   > `NEXT_PUBLIC_WS_ORIGIN` is read at build time, so if you change it, redeploy
   > the frontend.

## Step 4 — Wire up the domains

1. Backend service → Settings → Networking → **Custom Domain** → `api.yourdomain`.
2. Frontend service → Settings → Networking → **Custom Domain** → `app.yourdomain`
   (or the bare `yourdomain` — just keep `PUBLIC_BASE_URL`/`CORS_ORIGINS` in sync).
3. Add the CNAME records Railway shows you at your domain registrar.

Railway issues HTTPS certificates automatically once DNS resolves.

## Step 5 — Set up Brevo email

1. In Brevo: **Settings → SMTP & API → SMTP**. Copy the **login** and generate an
   **SMTP key**.
2. Put them in the backend's `SMTP_USER` / `SMTP_PASSWORD` variables (Step 2).
3. In Brevo, add and verify a **sender** matching `SMTP_FROM` (Brevo walks you
   through the DNS records). Until a sender is verified, mail may land in spam.

---

## Step 6 — Verify the live app

Once all services show green:

- [ ] Visit `https://app.yourdomain` — landing page loads over HTTPS.
- [ ] Register with a real `@student.ius.edu.ba` address — the verification email
      arrives (check spam first time).
- [ ] Click the link, log in — you land in the feed.
- [ ] Post something, upvote it, refresh — it persists (DB works).
- [ ] Upload a photo — it displays (volume works).
- [ ] Open a club chat or DM in two browsers — a message in one appears instantly
      in the other (**WebSockets work**). If it doesn't, re-check
      `NEXT_PUBLIC_WS_ORIGIN` and `COOKIE_DOMAIN`.
- [ ] Redeploy (push a commit) and confirm the photo you uploaded is still there.

## Making yourself an admin

The moderation endpoints are guarded by the `ADMIN_KEY` you set — send it as the
`x-admin-key` header. Keep that key private; anyone with it can moderate.

---

## Cost note

Railway is **~$5/month** after the initial trial credit. Postgres, Redis, both
services, and the volume all draw from that. Brevo email and Railway's HTTPS are
free. There are no other charges unless traffic grows well beyond a campus launch.

## Local development is unchanged

None of this affects local dev. `docker compose up --build` still runs everything on
`localhost:3000` with hot reload, the dev email stub (links print to
`docker compose logs backend`), and host-only cookies. The production behavior only
switches on when `ENVIRONMENT=production` and the other variables are set.
