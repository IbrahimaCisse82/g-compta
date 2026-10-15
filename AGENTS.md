# Working on this repo (G-Compta)

## What it is
Vite 5 + React 18 + TypeScript SPA (shadcn/ui, Tailwind). There is **no local
backend and no local database**: all data comes from the user's hosted Supabase
project through `src/integrations/supabase/client.ts`, configured by
`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` in the repo's own `.env`.

## Running it here
```sh
docker compose -f docker-compose.base44.yml up -d --build
```
One service (`web`) built on `oven/bun:1`, repo bind-mounted at `/app`, Vite dev
server on host port 3000 (the preview entry point). Startup installs from the
lockfile and then runs `vite --host 0.0.0.0 --port 3000`; edits hot-reload.

Checks:
- tests: `docker compose -f docker-compose.base44.yml exec -T web bunx vitest run`
- production build: `... exec -T web bunx vite build` (does **not** type-check)

## Non-obvious findings
- **`bun.lock` is the authoritative lockfile.** `package-lock.json` is stale (it
  is missing ~11 dependencies, e.g. `vitest`, `drizzle-orm`, `@supabase/supabase-js`),
  so `npm ci` fails / `npm install` rewrites it. Always use `bun install --frozen-lockfile`.
- **Vite host check vs. the Base44 preview proxy.** The proxy forwards the request
  with a `<port>-<sandbox id>.$BASE44_SANDBOX_HOST_DOMAIN` Host header, which Vite
  answers with `403 Blocked request` for the page *and* every asset - the app looks
  like it "fails to start" while the dev server is actually healthy. Vite 5.4.19
  does **not** honour `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` (the string does not
  exist in its dist), so `vite.config.ts` sets
  `server.allowedHosts = ['.' + BASE44_SANDBOX_HOST_DOMAIN]`, gated on
  `BASE44_PREVIEW_MODE === '1'`. Verified both ways: with the flag the sandbox host
  returns 200, with the flag unset it still returns 403 (original behaviour) and
  `localhost` keeps working.
- **No secrets are required to boot.** The preview starts with the committed `.env`;
  Supabase-backed screens show empty data if those values are absent, but the app
  renders. There is therefore no `requiredAtBoot` secret.
- **Demo mode is read-only** and is the quickest way to exercise the real app:
  Landing → "Lancer la Démo" (reads Supabase, falls back to bundled
  `src/lib/demo-data.ts`).
- **No database credentials exist in this sandbox** (only the public key in `.env`),
  so schema/RLS/privilege claims can be *measured* only on a local PostgreSQL
  rebuilt from this repo's own migrations — 31 files in `supabase/migrations` then
  the 2 in `drizzle/migrations`, in that order. Two prerequisites matter:
  (1) stub `auth.uid()`, `auth.users`, `storage.foldername`, `cron.*` and install
  `pgcrypto` (the audit trigger uses `digest`); (2) reproduce Supabase's default
  privileges with
  `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;`
  **before** running the migrations — without it every table looks under-granted
  and you will report false "permission denied" findings. Only `CREATE EXTENSION
  pg_cron` fails in that environment. Read-only checks against the hosted project
  (row counts, privilege behaviour) work with the public key through PostgREST.
