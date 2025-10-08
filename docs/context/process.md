# Process & Quality Gates

- **Local development**
  - Install deps: `npm install`.
  - Run dev server: `npm run dev` (Netlify dev for client + functions).
  - Run tests: `npm run test` (Vitest via jsdom/Testing Library).
  - Before pushing: `npm run check` (runs `format:check`, `lint`, `typecheck`, `knip`).
  - Run `npm run hooks:install` once per clone so Lefthook keeps the local hooks in sync.
  - Optional targeted scans: `npm run knip` for unused code, `npm run format` to auto-fix style.

- **Hooks & Tooling**
  - `npx lefthook install` installs hooks (`format:check` on commit, `check` on push).
  - `git secrets --register-aws && git secrets --install` enables secret scanning.

- **CI**
  - `.github/workflows/ci.yml` runs `npm run check`, `npm run test -- --run`, and `npm run build` on push & PR.
  - Branch protection should require CI to pass on both `development` and `main` before merge.

- **Deployment**
  - Netlify auto-builds `main` (production). `development` is published as https://development--lorg.netlify.app with HTTP basic auth via the branch-deploy context; credentials live in Netlify environment variables.
- Supabase migrations live in `db/migrations/`—run manually via `psql` when needed (apply new files like `003_add_measurement_preference.sql`, `004_add_peak_place_type.sql`, and `005_add_place_visit.sql` before loading peaks or relying on check-in streaks in any environment).
  - A one-time `npm run places:backfill` (uses in-App PostgreSQL only, no Strava calls) replays past activities to populate `place_visit` whenever new place types are added.
