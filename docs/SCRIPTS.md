# NPM Script Reference

| Script | Description | Required Environment |
| ------ | ----------- | -------------------- |
| `npm run dev` | Start Netlify Dev (React UI + functions) | Ensure `.env` has Strava and Supabase tokens |
| `npm run build` | Production build via Vite + Netlify | — |
| `npm run preview` | Serve the production bundle locally | Run after `npm run build` |
| `npm run fixtures:replay -- <user-id> [dir]` | Replays saved Strava fixtures through the background processor | `STRAVA_FIXTURES`, `DATABASE_URL` |
| `npm run fixtures:compare -- [dir]` | Compares novel metrics across fixtures | None |
| `npm run assets:build` | Generates raster logos from SVG | — |
| `npm run places:load` | Loads GeoJSON boundaries from `data/places/` into Postgres | `DATABASE_URL` (include `?sslmode=require`), optional `NODE_TLS_REJECT_UNAUTHORIZED=0` |
| `npm run annotate:test -- <user-id> [fixturesDir]` | Dumps Strava activity IDs from fixtures for debugging annotations | Defaults to `fixtures/strava`; override the directory with the optional second arg |
| `npm run typecheck` | TypeScript no-emit check | — |

All scripts run from the repo root. Set env vars inline (`VAR=value npm run …`) or add them to your shell/session beforehand.
