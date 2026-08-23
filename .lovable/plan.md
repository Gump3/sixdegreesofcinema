# Harden the admin token

Remove the hardcoded hash fallback so the admin page trusts only the `ADMIN_TOKEN` secret stored in Lovable Cloud, then rotate and verify.

## What changes

1. **`src/lib/admin-token.ts`** — delete the `ADMIN_TOKEN_SHA256` constant, the `sha256Hex` helper, and the hash-comparison branch. `isValidAdminToken` becomes a constant-time-ish comparison against `process.env.ADMIN_TOKEN` only, returning `false` when the secret is unset. `hasConfiguredAdminToken()` returns `Boolean(process.env.ADMIN_TOKEN)`, so with no secret the admin page shows its existing "Setup required" screen instead of granting access.
2. **Rotate the secret** — generate a fresh 64-character random value directly into the `ADMIN_TOKEN` secret using the secret generator. The value is never printed in chat or written to code; only the Cloud secret store holds it.
3. **Verify** — after rotation, check that:
   - a request carrying the old token is rejected (`Unauthorized`),
   - a request carrying no token shows the prompt screen,
   - the admin route still loads metrics with a valid token.

## How the new token reaches you

Generated secrets are write-only — even I can't read the value back. So after rotation you'll need a way to get it once. Two options:

- **A**: you generate your own strong value (password manager or `openssl rand -hex 32`) and save it via the secure secret form. You keep the value; nothing is pasted in chat.
- **B**: I generate it into the store and add a one-time, self-destructing reveal path (extra code) so you can read it once.

Option A is simpler and needs no extra code — recommended.

## Verification approach

Since I can't read the secret, I can verify the negative cases directly (old token rejected, empty token rejected) and confirm the code path. The positive case (`/admin?token=NEW_TOKEN` loads) is a one-line check you run in your browser after saving the new secret.

## Not in scope

No changes to analytics, metrics queries, or any other route. Repo visibility stays as-is until you confirm the checks pass.
