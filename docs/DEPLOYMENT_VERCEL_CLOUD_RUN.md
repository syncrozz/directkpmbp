# DIRECTKPMBP — Vercel + Google Cloud Run Deployment Guide (SES v4.5)

## 1. Locked Split-Hosting Architecture

| Layer | Host / Service | Responsibility |
| :--- | :--- | :--- |
| **Frontend SPA** | **Vercel** | React 19 + Vite static bundle, Firebase Client SDK (Auth, Firestore, Storage) |
| **Metadata API** | **Vercel Serverless** (`api/metadata/detect.ts`, `api/health.ts`) | Fast same-origin URL metadata & favicon/OG detection with SSRF guard |
| **Homepage Snapshot API** | **Google Cloud Run** (`POST /api/platform/snapshot`) | Headless Chromium (`1440×810`) capture -> `640×360` WebP optimization (`sharp`) |
| **Auth & RBAC** | **Firebase Authentication (`syncrozz4`)** | Google Sign-In + server-side RS256 ID Token verification + 7-email Master Admin allowlist |
| **Database & Assets** | **Firebase Firestore & Storage (`syncrozz4`)** | `/platforms/directkpmbp/platformLinks/{id}` & `/platforms/directkpmbp/thumbnails/` |

> **Security Principle:** CORS is browser defense-in-depth only and is **never** treated as authentication. Every `POST /api/platform/snapshot` request requires a valid Firebase ID Token (`Authorization: Bearer <token>`) belonging to an authorized Master Administrator.

---

## 2. Cloud Run Snapshot Backend Configuration

### Runtime Specifications
- **Base Image:** `node:22-bookworm-slim` (defined in `Dockerfile`)
- **Entrypoint:** `node server.ts` (Node.js 22 native TypeScript type-stripping; runs statelessly without Vite dev dependencies)
- **Memory:** `2 GiB` (`--memory 2Gi`) — recommended headroom for concurrent headless Chromium pages + `sharp` WebP encoding
- **CPU:** `1` or `2` vCPU (`--cpu 2` recommended for crisp <4s captures)
- **Request Timeout:** `60s` (`--timeout 60`, safely above internal 16s Playwright capture deadline)
- **Concurrency:** `2` to `4` per instance (`--concurrency 4`; internal semaphore caps active Chromium pages at `2` + queue `4`)
- **Scaling:** `--min-instances 0` (scales to zero when idle; set `1` only if zero cold-start latency is desired), `--max-instances 3`
- **Ingress / IAM:** Deploy with `--allow-unauthenticated` at the Cloud Run HTTP layer so Vercel browser clients can invoke the endpoint after CORS preflight (`OPTIONS`) and authenticate at the application layer via Firebase Bearer ID Token (`verifyMasterAdminRequest`).

### Required Cloud Run Environment Variables

| Variable | Required | Example / Value | Notes |
| :--- | :--- | :--- | :--- |
| `PORT` | Managed by Cloud Run | `8080` | `Dockerfile` defaults to `8080`; Cloud Run injects `PORT` automatically |
| `NODE_ENV` | Yes | `production` | Disables Vite middleware and runs API-only fallback |
| `ALLOWED_ORIGINS` | **Yes (Production)** | `https://directkpmbp.syncrozz.com,https://syncrozz-platform.web.app` | Comma-separated exact origins. Wildcard `*` is rejected by `serverCors.ts`. Include exact Vercel production & preview URLs as needed. |
| `PLAYWRIGHT_BROWSERS_PATH` | Baked in Dockerfile | `/ms-playwright` | Ensures `node` user resolves installed Chromium binary |
| `CHROMIUM_EXECUTABLE_PATH` | Optional | *(unset in Cloud Run)* | Auto-resolved via `playwright-core` `chromium.executablePath()` and fallback paths |

### Health Check Configuration
- **Endpoint:** `GET /api/health`
- **Expected Response:** HTTP `200` `{ "status": "ok", "service": "Directory KPMBP" }`
- **Cloud Run Probe:** Configure HTTP startup/liveness probe path `/api/health` on port `8080`.

### Chromium Resolution Order (`src/services/serverSnapshot.ts`)
1. `process.env.CHROMIUM_EXECUTABLE_PATH`
2. `process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`
3. `playwright-core` `chromium.executablePath()` (primary resolution in `Dockerfile`)
4. Container & system fallbacks (`/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell`, `/usr/bin/chromium`, etc.)

---

## 3. Vercel Frontend Environment Configuration

`src/services/platformService.ts` resolves the snapshot endpoint via `resolveSnapshotEndpointUrl()`:
- When `VITE_SNAPSHOT_API_BASE_URL` is **unset / empty**: uses same-origin `/api/platform/snapshot` (AI Studio / local `npm run dev`).
- When `VITE_SNAPSHOT_API_BASE_URL` is **set**: sends `POST <VITE_SNAPSHOT_API_BASE_URL>/api/platform/snapshot` with `Authorization: Bearer <firebase-id-token>` and `Content-Type: application/json`.

| Vercel Environment | Variable | Value |
| :--- | :--- | :--- |
| **Production** | `VITE_SNAPSHOT_API_BASE_URL` | *Populate after Cloud Run service is deployed (e.g. `https://<deployed-cloud-run-service-url>`)* |
| **Preview** | `VITE_SNAPSHOT_API_BASE_URL` | *Optional: staging or production Cloud Run URL (must also be allowed in Cloud Run `ALLOWED_ORIGINS`)* |
| **Development** | `VITE_SNAPSHOT_API_BASE_URL` | Leave **unset** to use local `server.ts` `/api/platform/snapshot` |

> **Important:** Never place server secrets or service account credentials in any `VITE_*` variable.

---

## 4. Manual Post-Preparation Deployment Checklist (Not Yet Executed)

1. **Build & Push Snapshot Container (Google Cloud Build / Artifact Registry):**
   ```bash
   gcloud builds submit --tag <REGION>-docker.pkg.dev/<PROJECT_ID>/<REPO>/directkpmbp-snapshot:latest
   ```
2. **Deploy Cloud Run Service:**
   ```bash
   gcloud run deploy directkpmbp-snapshot \
     --image <REGION>-docker.pkg.dev/<PROJECT_ID>/<REPO>/directkpmbp-snapshot:latest \
     --region asia-southeast1 \
     --platform managed \
     --allow-unauthenticated \
     --memory 2Gi \
     --cpu 2 \
     --timeout 60 \
     --concurrency 4 \
     --min-instances 0 \
     --max-instances 3 \
     --set-env-vars "NODE_ENV=production,ALLOWED_ORIGINS=https://directkpmbp.syncrozz.com"
   ```
3. **Copy Deployed Cloud Run HTTPS URL into Vercel:**
   - Set `VITE_SNAPSHOT_API_BASE_URL` in Vercel Project Settings -> Environment Variables (Production).
   - Redeploy Vercel frontend so Vite embeds `import.meta.env.VITE_SNAPSHOT_API_BASE_URL`.
4. **Live End-to-End Verification After Deployment:**
   - Verify `GET <CLOUD_RUN_URL>/api/health` returns `200`.
   - Verify `OPTIONS <CLOUD_RUN_URL>/api/platform/snapshot` with Vercel `Origin` returns `204` and exact `Access-Control-Allow-Origin`.
   - Sign in on Vercel as Master Admin and test **Generate / Regenerate Snapshot** in Platform Hub.
