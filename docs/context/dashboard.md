# Dashboard & Achievements

## Current experience
- `/dashboard` fetches `/me` for a consolidated payload (auth state, activity stats, recent unlocks).
- Distances respect the athlete’s Strava measurement preference. We persist it on `app_user.measurement_preference` and default to imperial if unset.
- Cards include activity count, seven-day exploration, lifetime exploration, next milestone, and the most recent milestone unlocked.
- Recent activities list the past five processed uploads with new-distance totals and generated annotations when available.

## Backend notes
- `netlify/functions/me.ts` aggregates activity counts, recent distance, milestones, and latest activities. It now selects the stored measurement preference so the client can format units consistently.
- `activity-process-background.ts` captures `detail.athlete.measurement_preference` on every run and updates `app_user.measurement_preference` when present.
- Static milestone thresholds live in `me.ts` for now. When we move to a dedicated `user_milestone` table, update this doc and the handler accordingly.

## UI implementation
- `src/client/routes/Dashboard.tsx` handles data fetch, loading/error states, preference resolution, and formatting helpers (miles/kilometers/meters/feet as needed).
- Headline cards use `DashboardStatCard`; keep additions small and reuse the distance helpers so units stay aligned.
- Recent activity entries show the formatted start date and any annotation text returned by the API.

## Follow-ups
- Add Vitest coverage for the formatting helpers (especially preference fallbacks and sub-mile/metric values).
- Surface milestones unlocked with timestamps once backend support exists.
- Consider surfacing peak streaks or other achievements once those metrics are exposed alongside place counts.
