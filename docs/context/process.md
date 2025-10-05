# Process & Quality Gates

- **Local development**
  - Install deps: `npm install`.
  - Run dev server: `npm run dev` (Netlify dev for client + functions).
  - Before pushing: `npm run check` (runs `format:check`, `lint`, `typecheck`, `knip`).
  - Optional targeted scans: `npm run knip` for unused code, `npm run format` to auto-fix style.

- **Hooks & Tooling**
  - `npx lefthook install` installs hooks (`format:check` on commit, `check` on push).
  - `git secrets --register-aws && git secrets --install` enables secret scanning.

- **CI**
  - `.github/workflows/ci.yml` runs `npm ci` + `npm run check` on push & PR.
  - Branch protection should require CI to pass before merge.

- **Deployment**
  - Netlify auto-builds on main; ensure `npm run build` succeeds locally when touching backend.
  - Supabase migrations live in `db/migrations/`—run manually via `psql` when needed.
