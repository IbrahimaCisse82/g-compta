# Base44 dev environment

## Stack
Lovable-generated **Vite 5.4 + React 18 + TypeScript + Tailwind + shadcn-ui** single-page app.
Backend is a **remote hosted Supabase** project (`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` in the committed `.env`). No local database is required — the app talks to the remote Supabase directly from the browser.

## Running
`docker compose -f docker-compose.base44.yml up -d` — starts a `node:22-slim` container that bind-mounts the repo, runs `npm install`, then `vite` dev server on port 8080 (mapped to host 3000). Live reload is active; edits appear without rebuilds.

## Quirks
- **Vite host check**: Vite 5.4.19 blocks the preview's external hostname. `vite.config.ts` sets `server.allowedHosts: true` to allow it. The `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` env var only works on Vite 6.1+, so it is set via config instead.
- The committed `.env` already contains the public Supabase anon key — no external credentials are needed to boot. If the Supabase project is paused or the key rotates, update `.env`.
- `supabase/` holds migrations and edge functions for the remote project; they are not run locally in this dev setup.

## Verify
- `curl -sf http://localhost:3000/` returns the `G-Compta` HTML.
- `curl -H "Host: 3000-$BASE44_SANDBOX_HOST_DOMAIN" http://localhost:3000/` must return 200 (host check).
