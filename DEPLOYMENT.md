# Deploying ShopWalk 360

Frontend → **Vercel** (static Vite build). Backend API → **Railway** (Express). Media → **Cloudflare R2**.
Both platforms deploy from the same GitHub repo; each only runs its own part:

- Vercel uses `vercel.json` (`vite build` → `dist`). `.vercelignore` excludes `server/`, `server.ts` and the database.
- Railway uses `railway.json` (`npm start` → `tsx server.ts`, health check `/health`). The API does **not** serve the frontend unless `SERVE_FRONTEND=true`.

## 1. Railway (backend)
1. New Project → Deploy from GitHub repo.
2. Add a **Volume** mounted at `/data` (the SQLite database and any local uploads live there; without it data is lost on every redeploy).
3. Add the variables below, deploy, then Settings → Networking → Generate Domain (e.g. `https://shopwalk360-api.up.railway.app`).
4. Check `https://<railway-domain>/health` returns `{"ok":true}`.

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `AUTH_SECRET` | long random string (`openssl rand -hex 32`) |
| `CORS_ORIGINS` | your Vercel URL(s), comma separated, e.g. `https://shopwalk360.vercel.app` |
| `ADMIN_EMAIL` | your admin login email |
| `ADMIN_PASSWORD` | strong password (min 10 chars) |
| `ADMIN_NAME` | name shown in admin (optional) |
| `DATABASE_PATH` | `/data/shopwalk360.db` |
| `UPLOAD_DIR` | `/data/uploads` |
| `PUBLIC_API_URL` | the Railway domain, e.g. `https://shopwalk360-api.up.railway.app` |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_BUCKET` | bucket name |
| `R2_PUBLIC_URL` | public bucket URL (r2.dev or custom domain), no trailing slash |
| `GEMINI_API_KEY` | optional – product assistant AI answers |
| `AVATAR_PROVIDER_*`, `TRYON_PROVIDER_*` | optional – only if you sign up for those services |

Railway sets `PORT` itself — do not add it.

### Cloudflare R2 setup
- Create the bucket, enable public access (r2.dev subdomain or custom domain) and put that URL in `R2_PUBLIC_URL`.
- Bucket → Settings → CORS policy: allow `GET`/`HEAD` from your Vercel origin (needed for 3D video textures and GLB models).
- If R2 vars are missing, uploads fall back to the Railway volume (`UPLOAD_DIR`).

### About Cloudflare D1
The product database is SQLite (better-sqlite3) stored on the Railway volume. Cloudflare D1 is not used: the whole API is written against synchronous SQLite, and D1 is only reachable through an async HTTP/Workers API, so moving to it means rewriting every query. Cloudflare is used for media storage (R2).

## 2. Vercel (frontend)
1. New Project → import the same GitHub repo. Framework preset: Vite (taken from `vercel.json`).
2. Environment variable (only one):

| Variable | Value |
|---|---|
| `VITE_API_URL` | the Railway domain, e.g. `https://shopwalk360-api.up.railway.app` (no trailing slash) |

3. Deploy. Then copy the Vercel URL into Railway's `CORS_ORIGINS` and redeploy Railway.

## 3. URLs
- Customer store: `https://<vercel-domain>/`
- Admin: `https://<vercel-domain>/admin` (not linked anywhere in the customer site). Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## 4. After first login
Admin → Settings: fill in business address, phone, support email, About us, returns policy, shipping rates and (if you accept it) bank details — the storefront shows only what you enter. Card payments are disabled until a real payment gateway is integrated; Cash on Delivery and (if bank details exist) Bank Transfer work.
