# Project Overview

- **Name**: Lorg (FreshTracks starter)
- **Purpose**: Connect to Strava, ingest activities, compute “new distance” vs. existing map history, and surface results via Netlify Functions + React client.
- **Key Flows**:
  - OAuth with Strava (`auth-strava`, `auth-strava-callback`).
  - Webhook ingestion -> `activity-process-background` -> optional annotation update via `strava-annotate`.
  - React client: explore data (`/data`), support form (`/support`), Strava connect (`/`).
- **Deployment**: Netlify for functions + static assets, Supabase Postgres (PostGIS enabled) for data storage.
- **Environments**: Local (`npm run dev`), Netlify deploy previews/production, Supabase dev/prod databases via `.pg_service.conf`.
