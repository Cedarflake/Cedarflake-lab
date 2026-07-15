# Shika Operations Guide

This guide owns the executable setup, migration, deployment, recovery, and troubleshooting procedures for Shika. The technical boundaries remain in [`architecture.md`](./architecture.md), and the public/private behavior remains in [`product-contract.md`](./product-contract.md).

## Safety rules

- Keep all values in this guide server-only. None of the variables uses a `NEXT_PUBLIC_` prefix.
- Commit `.env.example`, but never commit `.env.local`, OAuth secrets, auth secrets, database tokens, database files, exports, or recovery artifacts.
- Use different OAuth Apps, authentication secrets, cursor secrets, databases, and database tokens for development, fixed staging, and production.
- Do not give ephemeral pull-request previews production OAuth or database credentials. Use a fixed staging host for real OAuth verification.
- Run production migrations as an explicit release step. Application startup and serverless requests must never run migrations.
- Treat the production database and deployment as separate rollback domains. Record a database recovery point before migration and retain the previous compatible application deployment.

The repository already ignores `apps/shika/.env.local`, `apps/shika/.data/`, and `.vercel/`. Check `git status` before every commit so a differently named secret or export is not added accidentally.

## Local environment

From the repository root, create the ignored local file:

```powershell
Copy-Item apps/shika/.env.example apps/shika/.env.local
```

Use this local shape:

```dotenv
BETTER_AUTH_SECRET=<local-secret-at-least-32-characters>
BETTER_AUTH_URL=http://localhost:3000
GITHUB_CLIENT_ID=<local-oauth-client-id>
GITHUB_CLIENT_SECRET=<local-oauth-client-secret>
GITHUB_OWNER_ID=<positive-decimal-github-account-id>
AUTH_CLIENT_IP_HEADER=
PUBLIC_TIMELINE_CURSOR_SECRET=<different-local-secret-at-least-32-characters>
TURSO_DATABASE_URL=file:.data/shika.db
TURSO_AUTH_TOKEN=
```

Next.js loads `.env.local` for the application. Standalone tools such as `tsx` and Drizzle Kit do not automatically load it; the migration sections below therefore show when variables must be supplied in the shell.

### Variable reference

| Variable | Required | Rules |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | On authentication routes | Server-only Better Auth signing/encryption secret. It must contain at least 32 characters. Generate a new value for every environment. |
| `BETTER_AUTH_URL` | On authentication routes | Canonical application origin only, such as `http://localhost:3000` or `https://status.example.com`. Do not include a path, query, fragment, username, or password. Production requires HTTPS. |
| `GITHUB_CLIENT_ID` | On authentication routes | Client ID from the GitHub OAuth App created for this exact environment. |
| `GITHUB_CLIENT_SECRET` | On authentication routes | Secret from the same GitHub OAuth App. Store it only in `.env.local` or the deployment provider's encrypted secret store. |
| `GITHUB_OWNER_ID` | On authentication and owner routes | Positive decimal GitHub account ID. This is not a login, email, display name, or Better Auth user ID. Only this provider account is authorized. |
| `AUTH_CLIENT_IP_HEADER` | Production authentication | Leave blank locally. Production accepts exactly `x-vercel-forwarded-for`, `x-nf-client-connection-ip`, or `cf-connecting-ip`. Trust the value only when requests arrive directly through that provider. |
| `PUBLIC_TIMELINE_CURSOR_SECRET` | Public timeline routes | Independent server-only HMAC secret with at least 32 characters. Do not reuse `BETTER_AUTH_SECRET`; rotating it invalidates existing public history cursors. |
| `TURSO_DATABASE_URL` | All data routes | Use `file:.data/shika.db` locally. Use the assigned `libsql://` URL for Turso. The runtime also understands `:memory:` for tests. |
| `TURSO_AUTH_TOKEN` | Remote database only | Leave blank for `file:` and `:memory:` databases. Every remote database URL requires a non-empty token. |

Configuration is validated lazily by the affected runtime boundary. A build can load modules without production secrets, but a database, timeline, or authentication request fails closed when its required variables are invalid.

### Generate independent secrets

Run this command twice and use the two different outputs:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

- First output: `BETTER_AUTH_SECRET`
- Second output: `PUBLIC_TIMELINE_CURSOR_SECRET`

The command creates 32 random bytes and encodes them without characters that need special handling in an environment file. Do not paste either output into an issue, chat, log, screenshot, or tracked file.

## GitHub owner OAuth

Create a GitHub OAuth App for local development with these values:

```text
Application name: Shika Local
Homepage URL: http://localhost:3000
Authorization callback URL: http://localhost:3000/api/auth/callback/github
```

Copy its client ID and newly generated client secret into the local environment. The callback must always be:

```text
<BETTER_AUTH_URL>/api/auth/callback/github
```

Create separate OAuth Apps for fixed staging and production so each environment has one exact canonical origin and callback. For a production origin of `https://status.example.com`, use:

```text
Homepage URL: https://status.example.com
Authorization callback URL: https://status.example.com/api/auth/callback/github
```

Obtain the authenticated account's immutable numeric GitHub ID with GitHub CLI:

```powershell
gh api user --jq .id
```

Put the returned decimal number in `GITHUB_OWNER_ID`. A renamed GitHub login does not require changing this ID. A different GitHub account is intentionally rejected with a generic owner-only error.

## Local file database

The default database is `apps/shika/.data/shika.db`. It is runtime data and is ignored by Git.

Apply every committed migration from the repository root:

```powershell
pnpm --filter shika db:migrate:local
```

The local migrator defaults to `file:.data/shika.db`, enables foreign keys, applies the full migration chain, verifies required tables, and verifies the singleton timeline clock. It rejects a remote URL so a local command cannot accidentally migrate production.

To exercise the full chain against a new disposable file, select a new filename in the current PowerShell session before running the same command:

```powershell
$env:TURSO_DATABASE_URL = "file:.data/migration-check.db"
pnpm --filter shika db:migrate:local
Remove-Item Env:TURSO_DATABASE_URL
```

Do not delete or replace an existing local database unless it is known to be disposable or has been backed up.

## Schema and migration workflow

Run every command from the repository root.

1. Change the typed schema under `src/lib/db/schema/`.
2. Generate migration SQL and snapshots:

   ```powershell
   pnpm --filter shika db:generate
   ```

3. Review the generated SQL and Drizzle metadata. Generated output is not accepted without human review.
4. Check migration consistency:

   ```powershell
   pnpm --filter shika db:check
   ```

5. Apply the complete chain to a new disposable local database and run the Shika test suite:

   ```powershell
   pnpm --filter shika db:migrate:local
   pnpm --filter shika test
   ```

6. Prove the forward migration against representative non-production data.
7. Record a production recovery point or encrypted export.
8. Apply the reviewed migration to Turso explicitly.
9. Deploy compatible application code, then run the release checks below.

For destructive schema changes, use expand, compatible deploy, data transition, and contract phases. Do not make an application rollback depend on immediately reversing a destructive database migration.

## Turso remote database

Create or select a Turso database outside this repository. Retrieve its URL and create a scoped token with the Turso CLI:

```powershell
turso db show <database-name> --url
turso db tokens create <database-name>
```

Store the resulting values in the deployment provider's encrypted environment configuration:

```dotenv
TURSO_DATABASE_URL=libsql://<database-host>
TURSO_AUTH_TOKEN=<database-token>
```

The remote migration configuration accepts only a `libsql://` URL and a non-empty token. Because Drizzle Kit does not load `apps/shika/.env.local`, provide the credentials through a temporary trusted shell or CI environment before applying a migration:

```powershell
$env:TURSO_DATABASE_URL = "libsql://<database-host>"
$env:TURSO_AUTH_TOKEN = "<database-token>"
pnpm --filter shika db:migrate
Remove-Item Env:TURSO_DATABASE_URL
Remove-Item Env:TURSO_AUTH_TOKEN
```

The placeholders above are documentation only. Avoid placing a real token in a recorded shell command; prefer a protected prompt, secret manager, or deployment job that injects it without logging.

## Turso backup, restore, and recovery rehearsal

Turso recovery creates a new database; it does not rewind or overwrite the source database in place. Keep the source database until the restored candidate has passed database, application, and privacy checks and the rollback observation period has ended. A database created from another database, a point in time, or a dump consumes database quota.

The commands in this section follow the current Turso CLI documentation for [database creation](https://docs.turso.tech/cli/db/create), [point-in-time recovery](https://docs.turso.tech/features/point-in-time-recovery), [SQL dumps](https://docs.turso.tech/cli/db/shell), [database URLs](https://docs.turso.tech/cli/db/show), and [database tokens](https://docs.turso.tech/cli/db/tokens/create). Recheck those references before an actual incident because CLI behavior and plan retention can change.

### Preflight and version record

Use a fresh trusted PowerShell session from the repository root. Stop owner writes for the entire snapshot, restore, validation, cutover, and rollback-decision window. Anonymous reads may continue. If writes resume on either database, a simple environment rollback can lose or fork newer data and requires a separately reviewed reconciliation.

Record the installed CLI version and confirm the flags used below exist:

```powershell
$CliVersion = (turso --version).Trim()
$CliVersion
turso db create --help
turso db shell --help
```

The create help must list `--from-db`, `--timestamp`, `--from-dump`, and `--wait`. If it does not, stop. Update the CLI with `turso update` as documented in the official [upgrade guide](https://docs.turso.tech/cli/upgrading), then record the new version and review the command help again. Do not discover changed recovery syntax during a production incident.

Choose explicit names no longer than Turso's 64-character database-name limit. Use a secure encrypted backup directory outside the Git checkout:

```powershell
$SourceDatabase = "shika-prod"
$RunId = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ")
$RecoveryDatabase = "shika-recovery-$RunId"
$DumpCheckDatabase = "shika-dump-check-$RunId"
$BackupRoot = [IO.Path]::GetFullPath("X:\encrypted-backups\shika")
$RepositoryRoot = [IO.Path]::GetFullPath((git rev-parse --show-toplevel).Trim())

if ($BackupRoot.StartsWith(
    $RepositoryRoot + [IO.Path]::DirectorySeparatorChar,
    [StringComparison]::OrdinalIgnoreCase
  )) {
  throw "BackupRoot must be outside the Git checkout"
}

New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
turso db show $SourceDatabase
```

Replace every example name and path deliberately. Do not copy a production token, database URL, dump contents, or recovery artifact into the repository, a ticket, chat, build log, or rehearsal record.

### Create a pre-change recovery point and dump

Before a migration or risky release, create an independent database copy and wait until it is ready:

```powershell
turso db create $RecoveryDatabase --from-db $SourceDatabase --wait
if ($LASTEXITCODE -ne 0) {
  throw "Turso recovery-point creation failed"
}
turso db show $RecoveryDatabase
```

Also create a portable SQL dump. The explicit UTF-8 writer avoids shell-dependent redirection encoding:

```powershell
$DumpPath = Join-Path $BackupRoot "$SourceDatabase-$RunId.sql"
$DumpLines = @(turso db shell $SourceDatabase .dump)
if ($LASTEXITCODE -ne 0 -or $DumpLines.Count -eq 0) {
  throw "Turso dump failed or was empty"
}
[IO.File]::WriteAllLines(
  $DumpPath,
  [string[]]$DumpLines,
  [Text.UTF8Encoding]::new($false)
)
$DumpHash = (Get-FileHash -LiteralPath $DumpPath -Algorithm SHA256).Hash.ToLowerInvariant()
$DumpHash
```

Turso documents that `.dump` omits libSQL and SQLite internal tables and can rebuild a database. Keep the dump encrypted, access-controlled, and covered by the same retention policy as production data. A hash detects artifact corruption but does not prove the dump can be restored.

### Restore a candidate

For a dump rehearsal, create a new database from the dump:

```powershell
turso db create $DumpCheckDatabase --from-dump $DumpPath --wait
if ($LASTEXITCODE -ne 0) {
  throw "Turso dump restore failed"
}
```

For incident recovery, choose an RFC 3339 UTC timestamp immediately before the first known bad write and create a different candidate:

```powershell
$RestoreTimestamp = "2026-07-15T12:34:56Z"
$PitrDatabase = "shika-pitr-$RunId"
turso db create $PitrDatabase --from-db $SourceDatabase --timestamp $RestoreTimestamp --wait
if ($LASTEXITCODE -ne 0) {
  throw "Turso point-in-time restore failed"
}
```

PITR retention is plan-dependent. The current Turso documentation states 24 hours for Free and 10, 30, or 90 days for Developer, Scaler, and Pro respectively. It also warns that the restored database can omit up to approximately 15 seconds immediately before the requested timestamp because of checkpoint timing. Record the plan, requested timestamp, and tolerated data-loss window; do not claim zero data loss from PITR.

### Validate before cutover

Run these checks against the selected candidate, first before and then after applying the committed Shika migrations:

```powershell
$CandidateDatabase = $RecoveryDatabase

turso db show $CandidateDatabase
turso db shell $CandidateDatabase "PRAGMA integrity_check;"
turso db shell $CandidateDatabase "PRAGMA foreign_key_check;"
turso db shell $CandidateDatabase "SELECT name, type FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name;"
turso db shell $CandidateDatabase "SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at;"
```

Stop if `integrity_check` returns anything other than one `ok` row, `foreign_key_check` returns any row, required application tables are absent, or the migration ledger does not match the reviewed migration chain. Compare the schema and representative public/private records with the source or the pre-incident evidence; never use row count alone as proof of privacy correctness.

Create a short-lived candidate token without printing it, migrate the candidate, and clear both temporary variables even when migration fails:

```powershell
$env:TURSO_DATABASE_URL = (turso db show $CandidateDatabase --url).Trim()
$env:TURSO_AUTH_TOKEN = (turso db tokens create $CandidateDatabase --expiration 1h).Trim()

if ([string]::IsNullOrWhiteSpace($env:TURSO_DATABASE_URL) -or
    [string]::IsNullOrWhiteSpace($env:TURSO_AUTH_TOKEN)) {
  Remove-Item Env:TURSO_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:TURSO_AUTH_TOKEN -ErrorAction SilentlyContinue
  throw "Candidate URL or token creation failed"
}

try {
  pnpm --filter shika db:migrate
  if ($LASTEXITCODE -ne 0) {
    throw "Shika candidate migration failed"
  }
} finally {
  Remove-Item Env:TURSO_DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:TURSO_AUTH_TOKEN -ErrorAction SilentlyContinue
}
```

Repeat the integrity, foreign-key, schema, and migration-ledger queries. Then deploy the same reviewed Shika revision to an isolated fixed staging host connected only to the candidate. Verify `/`, `/history`, a public incident detail, owner login, `/admin`, and logout. Use known canaries to prove private owner text is absent from public HTML, React Server Component payloads, metadata, counts, and history. Do not attach production OAuth credentials to an ephemeral preview.

### Cut over and roll back

Create a production-lifetime token for the candidate through a protected prompt or secret manager. Update `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` together in the deployment provider, then deploy the already reviewed application revision. Do not change the source database, candidate database, application revision, and schema in one unrecorded step.

After cutover:

1. Keep owner writes frozen.
2. Repeat the anonymous public-route and private-canary checks against the canonical production origin.
3. Verify owner login and a read-only `/admin` load.
4. Inspect sanitized application errors and database health without printing credentials or private records.
5. End the write freeze only after the acceptance decision is recorded.

If any gate fails before writes resume, restore the previous `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` together, redeploy the retained compatible application revision, and repeat the public/privacy checks. If writes have already resumed on the candidate, stop writes again and plan an explicit reconciliation; do not blindly point the application back to the old database.

Retain the source database, recovery-point database, dump, hashes, old deployment, and secret-manager versions through the documented observation and retention period. Delete a disposable rehearsal database only after the evidence is accepted, using the interactive `turso db destroy <database-name>` command from the official [destroy reference](https://docs.turso.tech/cli/db/destroy). Never use a production database name with `--yes` in a runbook.

### Rehearsal record template

Run this rehearsal before a destructive migration and on the team's recurring recovery schedule. Store the completed record in the approved private operations system, not in this repository:

```text
Shika Turso recovery rehearsal
Run ID / UTC start and end:
Operator and reviewer:
Reason: scheduled | pre-release | incident
Turso plan and documented PITR retention:
Turso CLI version:
Application commit/deployment retained for rollback:
Source database name (never token or full secret-bearing configuration):
Owner-write freeze start/end:
Recovery method: current copy | PITR | SQL dump
Requested PITR timestamp and accepted gap:
Candidate database name:
Encrypted dump location/reference and SHA-256:
Creation command result:
PRAGMA integrity_check result:
PRAGMA foreign_key_check result:
Schema and Drizzle migration-ledger comparison:
Candidate migration command result:
Public route checks:
Private-canary leak checks (HTML, RSC, metadata, counts, history):
Owner authentication and read-only admin checks:
Cutover performed: yes/no; environment version and deployment ID:
Rollback exercised: yes/no; result:
Source/candidate/dump retention deadline:
Deletion approval and completion, if applicable:
Exceptions, data-loss estimate, follow-up owner, and deadline:
Reviewer acceptance:
```

## Deployment environments

Configure the application from the monorepo root with Node.js 22.22.2 and pnpm 11.7.0. The owning commands are:

```text
Install: pnpm install --frozen-lockfile
Check:   pnpm --filter shika check
Build:   pnpm --filter shika build
```

Do not configure a serverless build or start command to run `db:migrate`. Apply migrations before the compatible application deployment.

Use a unique production value for every variable and set:

```dotenv
BETTER_AUTH_URL=https://<canonical-production-host>
AUTH_CLIENT_IP_HEADER=<provider-header-from-the-table-below>
TURSO_DATABASE_URL=libsql://<production-database-host>
TURSO_AUTH_TOKEN=<production-database-token>
```

| Direct hosting edge | `AUTH_CLIENT_IP_HEADER` |
| --- | --- |
| Vercel | `x-vercel-forwarded-for` |
| Netlify | `x-nf-client-connection-ip` |
| Cloudflare | `cf-connecting-ip` |

These are an allowlist enforced by Shika, not interchangeable examples. Set the header that the final trusted edge controls. If another reverse proxy sits in front of the host, validate the complete trust chain before production; do not switch to an arbitrary client-provided header.

The repository currently carries no provider-specific Netlify or Cloudflare adapter configuration. Confirm that the selected host supports this Next.js version and add any required adapter as a separately reviewed engineering change. Environment documentation alone does not prove deployment compatibility.

On Vercel, place secrets in Project Settings under Environment Variables and scope them separately for Development, Preview, and Production. Production credentials must not be attached to Preview. If the project is linked locally and variables are pulled, remember that `vercel env pull` replaces the destination file; preserve intentional local-only overrides and verify the resulting file remains ignored.

## Release and recovery checks

Before a production release:

1. Confirm the migration SQL was reviewed and the full chain passed against an empty database.
2. Complete and record the recovery-point, encrypted dump, restore, and validation procedure above outside the repository.
3. Apply the migration once with the intended production URL and token.
4. Deploy the compatible application build.
5. Verify the exact non-cached `/api/health` response, then verify `/`, `/history`, and a public incident detail without an authenticated session.
6. Verify owner login, `/admin`, logout, session expiry behavior, and rejection of a non-owner GitHub account.
7. Verify a private-only canary never appears in public HTML, React payloads, metadata, counts, or history.
8. Perform one reversible private mutation and one explicitly reviewed public mutation, then verify withdrawal, redaction, or suppression behaves according to the product contract.
9. Confirm application rollback remains available without undoing the database migration.

Test restoration against a new database periodically. An export that has never been restored is not sufficient recovery evidence.

## Validation commands

Run the smallest relevant command first:

```powershell
pnpm --filter shika lint
pnpm --filter shika typecheck
pnpm --filter shika test
pnpm --filter shika db:check
```

Before release or pull-request handoff, run the complete owner checks and build sequentially:

```powershell
pnpm --filter shika check
pnpm --filter shika build
```

`check` includes lint, type generation and TypeScript, tests, and migration consistency. The dedicated `[Project] Shika CI` workflow owns Shika validation: it runs `check`, migrates and seeds a disposable SQLite database, builds the app, verifies `/api/health`, then checks route-specific profile, component, incident, maintenance, and severity canaries in the HTML and React Server Component responses for `/`, `/history`, and `/incidents/[id]`. It rejects every private canary and any data response that permits shared caching. The shared Apps & Packages workflow intentionally excludes Shika. Changes to the root package manifest, lockfile, or pnpm workspace configuration automatically run Shika CI because they can alter Shika's dependency closure or runtime; unrelated repository changes do not.

## Troubleshooting

### A local page renders but forms and buttons do not respond

- Open the owner console through the exact `BETTER_AUTH_URL` origin. With the documented local configuration, use `http://localhost:3000` for login and `/admin`.
- Shika permits `127.0.0.1` as an additional Next.js development asset origin so a loopback preview can hydrate, but this does not change the Better Auth base URL, trusted origin, cookies, or GitHub callback.
- Do not switch between `localhost` and `127.0.0.1` during an owner session. If the tab was open while the development configuration reloaded, refresh it once on the canonical origin.

### `Shika database configuration is invalid`

- Confirm `TURSO_DATABASE_URL` exists and is exactly a supported libSQL URL.
- Use `file:.data/shika.db` locally. `TURSO_AUTH_TOKEN=` may remain blank for a local file database.
- For Turso, use the assigned remote URL and a non-empty token.
- Restart the development server after changing `.env.local`; the cached database client is created lazily once per process.

### `A Turso auth token is required for a remote database`

The URL is remote but `TURSO_AUTH_TOKEN` is absent or blank. Obtain a new database token, store it as a secret, and restart the affected process. Do not add a fake token to make validation pass.

### `Shika authentication configuration is invalid`

Check all of the following:

- `BETTER_AUTH_SECRET` has at least 32 characters.
- `BETTER_AUTH_URL` is an origin only; production uses HTTPS.
- both GitHub client values are non-empty and belong to the same environment's OAuth App.
- `GITHUB_OWNER_ID` is a positive decimal account ID with no username text.
- production has exactly one supported `AUTH_CLIENT_IP_HEADER` value.

Authentication configuration is loaded only when an auth or owner boundary needs it. A successful static build does not prove that owner login is configured.

### GitHub reports a callback mismatch

Compare the OAuth App callback with `<BETTER_AUTH_URL>/api/auth/callback/github` character for character. Check the scheme, host, port, and accidental path or trailing configuration. Do not reuse a localhost OAuth App for a production host.

### The signed-in GitHub account is denied

Run `gh api user --jq .id` while authenticated as the intended owner and compare the decimal output with `GITHUB_OWNER_ID`. A denial for any other account is expected behavior.

### `Shika timeline configuration is invalid` or history links fail

Set `PUBLIC_TIMELINE_CURSOR_SECRET` to an independent value of at least 32 characters. Restart the server. Rotating the value intentionally invalidates cursors already issued to visitors; restart history navigation from `/history`.

### Database tables are missing

Stop the Shika development process that owns the local connection, run `pnpm --filter shika db:migrate:local`, then restart it. For Turso, verify the target database name and recovery point before running the explicit remote migration command.

### The local migrator rejects the database URL

`db:migrate:local` intentionally accepts only `file:` URLs. Remove a remote `TURSO_DATABASE_URL` inherited by the shell or set a disposable local file URL for that command. Use `db:migrate` only for a reviewed Turso migration.

### A migration command ignores `.env.local`

This is expected. Next.js loads `.env.local`; standalone `tsx` and Drizzle Kit commands do not. Supply the intended URL and token through the current shell or a protected CI environment, then clear the temporary variables.

### Production starts but authentication fails immediately

Confirm `BETTER_AUTH_URL` is the final HTTPS origin and `AUTH_CLIENT_IP_HEADER` matches the direct hosting edge. Environment changes normally require a new deployment or process restart. Inspect only sanitized errors; never print OAuth credentials, database URLs, tokens, cookies, or raw authorization payloads.
