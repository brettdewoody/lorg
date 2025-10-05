# Security & Secret Scanning

## git-secrets

1. Install [`git-secrets`](https://github.com/awslabs/git-secrets) (brew install git-secrets on macOS).
2. Run the installer once per clone:

   ```bash
   git secrets --register-aws
   git secrets --install
   git secrets --scan
   ```

3. The hook will reject commits containing AWS-style keys or patterns you add. Extend with custom patterns as needed:

   ```bash
   git secrets --add 'STRAVA_[A-Z_]*'
   git secrets --add 'DATABASE_URL'
   ```

## Lefthook

1. Install lefthook globally (`brew install lefthook` or `npm install -g lefthook`) or run via npx.
2. Enable hooks in this repo:

   ```bash
   npm run hooks:install
   ```

3. Hooks run `npm run format:check` on commit and the full quality suite (`npm run check`) before push.

## Knip

- Detects unused files, exports, and dependencies. It runs automatically as part of `npm run check` and CI; run it manually with `npm run knip` when you need a dedicated pass.
