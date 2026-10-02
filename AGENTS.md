# Base44 Dev Environment

## Project Overview
G-Compta is a SYSCOHADA accounting web app (Vite + React + TypeScript + Tailwind + shadcn-ui), originally built with Lovable. It uses a **hosted Supabase** backend (not local) — credentials (anon/publishable key) are committed in `.env` and are safe to use as-is.

## Running the App
```
docker compose -f docker-compose.base44.yml up -d --build
```
- Vite dev server runs inside a `node:22-slim` container, bind-mounted at `/app`.
- Dependencies install via `npm install` on container startup (node_modules is an anonymous volume, not mounted from host).
- Dev server listens on port 8080 inside the container, mapped to host port 3000.
- Live reload is active — edits to source files appear in the preview automatically.

## Key Configuration
- `vite.config.ts` has `allowedHosts: true` to accept the preview's external hostname.
- The `.env` file provides `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_SUPABASE_PROJECT_ID` to the Vite client.
- No local database or backend services — all data goes to the hosted Supabase instance.

## Verifying the App
- `curl http://localhost:3000/` should return the HTML with title "G-Compta — Comptabilité SYSCOHADA en ligne".
- `docker compose -f docker-compose.base44.yml ps` should show the `web` service as `healthy`.

## Testing
```
docker compose -f docker-compose.base44.yml exec web npx vitest run
```
