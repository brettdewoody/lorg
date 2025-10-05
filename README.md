# FreshTracks Starter (Netlify + Supabase + Mapbox)

A minimal starter for an app that connects to Strava, map-matches activities, and computes **new distance** vs your previously visited network using PostGIS.

## Stack

- Netlify Functions (HTTP + Background + Scheduled)
- Supabase Postgres with PostGIS
  -- https://supabase.com/dashboard/project/sjmdzjgqvfmkugwerpwo/sql/5c6a3398-ad94-45ee-b8d2-8beb3b4f02e9
- React + Vite + Mapbox GL JS

## Quick start

1. Create a Supabase project and enable PostGIS:
   - SQL → run the migration in `db/migrations/001_init.sql`

2. Create a Strava app:
   - Set Redirect URI to: `https://<your-site>/.netlify/functions/auth-strava-callback`
   - Set Webhook callback: `https://<your-site>/.netlify/functions/strava-webhook`

3. Copy `.env.example` to `.env` and fill values.

4. Install deps:

```bash
npm i
```

5. Local dev:

```bash
npx netlify dev
```

This runs Vite + Netlify Functions locally.

6. Deploy:

- Push to GitHub
- Connect the repo in Netlify
- Set environment variables in Netlify UI

## Postgres

- Dev/staging DB: `PGSERVICEFILE=./.pg_service.conf psql service=lorg-dev`
- Production DB: `PGSERVICEFILE=./.pg_service.conf psql service=lorg-prod`
- Reset the dev database when you need a clean slate:
  ```bash
  PGSERVICEFILE=./.pg_service.conf psql service=lorg-dev -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
  PGSERVICEFILE=./.pg_service.conf psql service=lorg-dev -f db/migrations/001_init.sql
  ```

## NPM scripts

See `docs/SCRIPTS.md` for a full script reference and the environment variables required for each command.

## Development checks

- Run `npm run check` before committing; it verifies formatting, lint rules, TypeScript types, and unused code via Knip in one pass.
- GitHub Actions runs the same command on every push and pull request.
- Install Lefthook (`npm run hooks:install` or `npx lefthook install`) so your local hooks mirror CI (`format:check` on commit, `check` on push).
- Install `git-secrets` and register the hooks (`git secrets --register-aws && git secrets --install`) to prevent secret leakage; see `docs/SECURITY.md`.

## Context bundle

- Start with `docs/context/index.md` for a high-level overview tailored to automated maintainers.
- Additional playbooks and tasks live in `docs/context/`.

## Strava annotations

- The background processor records a message such as `"3.1 new miles"` (or kilometers when the athlete’s measurement preference is metric).
- New webhook-driven activities automatically trigger the `strava-annotate` Netlify function, which appends the message to the activity description.
- The Strava OAuth flow must request the `activity:write` scope (in addition to `read,activity:read_all`) so annotations can update activity descriptions; have connected athletes re-authorize after deploying the change.
- You can run the function manually for pending items:
  ```bash
  netlify functions:invoke strava-annotate
  ```
  Set `STRAVA_ANNOTATE_DRYRUN=1` to log actions without calling Strava.

## Assets

- SVG and PNG logos live in `src/client/public`.
- Regenerate the PNG after tweaking the SVG:
  ```bash
  npm install
  npm run assets:build
  ```

## Downloading personal Strava data (for local testing)

1. Enable read + activity scopes for your Strava app and grab a long-lived refresh token (you can reuse the one stored in `strava_token.refresh_token`).
2. Add the following to `.env` (values never checked into git). The downloader reads `STRAVA_CLIENT_ID/SECRET/REFRESH_TOKEN` first and only falls back to the `STRAVA_DEV_*` variants if those are missing. All three values (ID, secret, refresh token) must be present or the script will exit with a helpful error. Make sure the values belong to the same Strava application and that the refresh token was issued for that client (generate a new one via Strava’s OAuth flow if needed):

```
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
STRAVA_REFRESH_TOKEN=...
# Optional dev-specific values used only if the primary vars are unset
STRAVA_DEV_CLIENT_ID=...
STRAVA_DEV_CLIENT_SECRET=...
STRAVA_DEV_REFRESH_TOKEN=...
```

3. Install local dev deps if you haven’t yet:
   ```bash
   npm install ts-node dotenv @types/node --save-dev
   ```
4. Run the downloader; it automatically throttles on rate limits and stores JSON fixtures under `fixtures/strava-dev/` by default (ignored by git):

   ```bash
   node --loader ts-node/esm scripts/download-strava.ts
   ```

   Each activity gets three files: summary, detail, and lat/lng streams. You can replay these fixtures against the processing pipeline without hitting Strava or Supabase.

5. To replay the fixtures through the background processor (e.g., after truncating `activity`/`visited_cell`), run:

   ```bash
   npm run fixtures:replay -- <user-id> [fixturesDir]
   ```

   Provide the UUID from `app_user.id`. The script sets `STRAVA_FIXTURES` so `activity-process-background` reads JSON files instead of Strava’s API.

6. To inspect grid-cell novel distance against your full history offline:
   ```bash
   npm run fixtures:compare -- [fixturesDir]
   ```

```
This prints per-activity and aggregate totals using the same cell-based logic the backend now uses.

## Place boundary data
- Run `db/migrations/001_init.sql` (or the full migration chain) to ensure `place_boundary`/`visited_place` exist alongside the core tables. Locally: `psql -f db/migrations/001_init.sql` after exporting your `.env`.
- Load simplified polygons for the regions you support (e.g., UK countries, constituent nations, and counties) into `place_boundary`. Natural Earth and ONS datasets work well; keep geometries in `SRID 4326`.
- After loading the GeoJSON via `npm run places:load`, new activities automatically record unlocked places—no backfill runs by default. For Supabase or other hosted Postgres instances, set `PGSSLMODE=require` (or include `?sslmode=require` on `DATABASE_URL`) so the loader uses SSL.

## What’s included
- Minimal React page with Mapbox
- Netlify Functions stubs for OAuth, webhook handling, background processing, and place summaries
- Shared utilities for DB + Strava client
- PostGIS schema
- Support page (`/support`) with a Netlify form for user contact
- Visited-cell overlay and place counts on the data view

## Next steps
- Implement Mapbox Map Matching (or Valhalla) inside `activity-process-background.ts`
- Wire the UI to list activities and draw `novel_geom` vs `geom`
- Add privacy zones UI and API
```
