# Repository Guidelines

## Project Structure & Module Organization

- `src/client` hosts the Vite-powered React UI; keep components thin and delegate data fetching to shared helpers.
- `src/shared` centralizes auth, Strava, and database utilities used by Netlify functions; add reusable logic here.
- `netlify/functions` contains HTTP, background, and scheduled handlers; keep one exported `handler` per file and push heavy lifting into shared modules.
- `db/migrations` stores Postgres schema changes; keep migrations repeatable and mention them in PR notes.
- Root configs (`vite.config.ts`, `tsconfig.json`, `.pg_service.conf`, `.env*`) control build output and connectivity—touch them sparingly and document updates.

## Build, Test, and Development Commands

- `npm install` installs dependencies.
- `npm run dev` (Netlify dev) serves the React client and functions locally at http://localhost:8888.
- `npm run build` compiles the production bundle and serverless artifacts; run before merging backend changes.
- `npm run preview` serves the built bundle for smoke tests.
- Use `PGSERVICEFILE=./.pg_service.conf psql service=lorg-dev` for local/staging DB work, and `service=lorg-prod` for production access.

## Coding Style & Naming Conventions

- TypeScript is `strict`; prefer explicit types, `async/await`, 2-space indentation, and single quotes.
- React components use PascalCase names; hooks begin with `use` and live beside their consumers.
- Netlify function files follow kebab-case (`activity-process-background.ts`) while exported values stay camelCase.
- Prefix client-exposed env vars with `VITE_`; keep secrets server-side.

## Testing Guidelines

- No automated suite yet; when adding features, introduce targeted Vitest or integration coverage alongside the change.
- Document manual verification (`curl http://localhost:8888/.netlify/functions/health`) in PRs until tests exist.
- Exercise new data paths through `npm run dev` to confirm UI and functions stay aligned.
- Dry-run migrations against a disposable database before requesting review.

## Commit & Pull Request Guidelines

- Write imperative, 72-char-or-shorter commit subjects (`Add Strava webhook handler`) and keep commits focused.
- PR descriptions should summarize scope, link issues, flag env or migration impacts, and attach screenshots or sample payloads when endpoints change.
- Include a short checklist of tests or manual steps so reviewers can reproduce verification.

## Environment & Configuration

- Copy `.env.example` to `.env`, fill `DATABASE_URL`, `STRAVA_*`, and `VITE_MAPBOX_TOKEN`, and keep the file untracked.
- Store production secrets in Netlify; do not commit `.env` edits or certificates.
- Rotate `supabase-ca.pem` only when Supabase updates TLS certificates and note the source in the PR.

## Open tasks

- [ ] Roll out the updated Strava OAuth scope (`activity:write`) and prompt existing users to re-authorize so annotations can update descriptions.
- [ ] Install Lefthook locally (`npx lefthook install`) so `format:check` (pre-commit) and `check`/`knip` (pre-push) run before sharing changes.
- [ ] Install `git-secrets` and register repo hooks; add any additional secret patterns relevant to Lorg.
