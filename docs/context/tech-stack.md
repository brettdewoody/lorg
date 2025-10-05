# Tech Stack

- **Frontend**: React 18 + Vite, Mapbox GL JS, Tailwind CSS.
- **Backend**: Netlify Functions (TypeScript, bundled via Vite), Supabase Postgres with PostGIS.
- **Queue/Processing**: `activity-process-background` handles Strava webhook payloads, computes novel distance, queues annotation updates.
- **Auth**: Strava OAuth; session stored in `sv_session` cookie (JWT signed with `SESSION_SECRET`).
- **External APIs**: Strava REST (activities, token refresh). Mapbox tiles (client-side).
- **Tools**: TypeScript strict mode, ESLint + Prettier + Knip, Lefthook hooks, git-secrets scanning.
- **Scripts**: `npm run check` (format/lint/type/knip), `npm run build`, fixtures utilities under `scripts/`.
