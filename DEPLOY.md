# Deploying the frontend (Cloudflare Pages)

A static Vite/React SPA. It calls the backend at `VITE_API_URL`, so deploy the **backend first**, then build this with that URL.

## 1. Push this folder to GitHub (its own repo)
This is the frontend repo, separate from the backend.

## 2. Create a Cloudflare Pages project
Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick this repo.

Build settings:
- **Framework preset:** Vite (or None)
- **Build command:** `npm run build`
- **Build output directory:** `dist`

## 3. Set the build environment variable
Settings → **Environment variables → Production** (and Preview):
- `VITE_API_URL` = your Render backend URL, e.g. `https://summit-email-backend.onrender.com`

> ⚠️ `VITE_API_URL` is baked in at **build time**, not runtime. If you change it, you must **trigger a new build/deploy** for it to take effect.

## 4. Deploy, then close the CORS loop
After the first deploy you'll get a URL like `https://summit-email.pages.dev`.
Go to the **backend** (Render) and set `FRONTEND_ORIGIN` to that exact URL, then let it redeploy — otherwise the browser blocks API calls with a CORS error.

## Notes
- `public/_redirects` (`/* /index.html 200`) makes client-side routes like `/campaigns/5` work on refresh — Cloudflare Pages reads it automatically.
- Local dev is unchanged: `npm run dev` serves on :7701 and Vite proxies `/auth`, `/campaigns`, etc. to the local backend on :7700 (because `VITE_API_URL` is unset locally).
- A custom domain can be added in Pages → Custom domains (remember to add it to `FRONTEND_ORIGIN` too).
