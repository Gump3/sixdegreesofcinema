# Add a secret-scanning guard before going public

History scan came back clean, so this is purely preventive: stop a secret from ever landing in a commit.

## What gets added

1. **A scanner script** (`scripts/scan-secrets.mjs`, zero dependencies)
   - Scans staged files (or all tracked files when run with `--all`).
   - Blocks on: any `.env` file other than `.env.example`, Supabase secret/service keys (`sb_secret_`, `sbp_`, service-role JWTs), TMDB/admin token literals (`TMDB_API_KEY=<value>`, `ADMIN_TOKEN=<value>`), Postgres connection strings with a password, private key blocks, and common vendor tokens (`sk-`, `ghp_`, AWS `AKIA`).
   - Explicitly allows the publishable/anon Supabase key and `process.env.X` references, so it does not fire on existing code.
   - Prints file and line number only — never the matched value.

2. **A GitHub Actions workflow** (`.github/workflows/secret-scan.yml`)
   - Runs the scanner in `--all` mode on every push and pull request, so a bad commit fails CI even if it bypassed local hooks.

3. **A `scan:secrets` npm script** in `package.json` so you can run it on demand.

4. **A short "Secret scanning" note in README.md** under the existing security/privacy area, describing how to run it.

## Optional local hook

Git hooks are not tracked by Git, so the plan includes a one-line command in the README for you to enable it locally:
`git config core.hooksPath .githooks` with a committed `.githooks/pre-commit` that calls the scanner on staged files.

## Notes

- No history rewrite; nothing in the repo changes behaviourally, and the app build is untouched.
- The scanner is deliberately conservative: it flags value-bearing patterns, not variable names, to avoid noisy false positives.
