# Shika

Shika is a single-owner personal status application. It applies the operating model of a service status page to one person's self-reported state: anonymous visitors see only explicitly published status, incidents, maintenance, and history, while one configured GitHub account operates the complete private view.

## Current status

Shika is under active engineering rebuild. The current implementation includes the single-owner GitHub authentication boundary, Drizzle/libSQL persistence, reviewed migrations, public status and history routes, incident and maintenance projections, explicit component-status outcomes committed atomically with incident resolution and maintenance start/completion, a task-oriented owner console with a sticky desktop module-and-record sidebar and one replaceable right-side pane, an authorized paginated owner timeline, split owner/public incident-reference snapshots, explicit publication of an existing private maintenance window through a reviewed snapshot, singleton site-profile edit/publication/privacy controls, and automated domain and database tests.

This is not yet a production release or an approved visual design. The current interface is an engineering surface for validating product behavior. The final typography, palette, density, components, responsive treatment, and interaction model require explicit maintainer review before they are treated as finished. No Live URL is documented until a deployment and its privacy checks are verified.

## Stack

- Next.js 16 App Router and React 19
- TypeScript in strict mode
- next-intl with English and Simplified Chinese message catalogs
- Tailwind CSS 4 and React Compiler
- Lucide React for interface icons
- Better Auth with a GitHub OAuth App
- Turso/libSQL through `@libsql/client`
- Drizzle ORM with committed SQL migrations
- Zod runtime configuration validation
- Node.js tests executed through `tsx`

## Prerequisites

- Node.js 22.22.2, matching the root workspace runtime declaration
- pnpm 11.7.0 through the root `packageManager` declaration
- A GitHub OAuth App for owner sign-in
- A local file database for development, or a Turso database and token for remote environments

## Local development

Run commands from the repository root.

1. Install workspace dependencies:

   ```powershell
   pnpm install
   ```

2. Copy the environment template and fill every value described in the [operations guide](./docs/operations.md):

   ```powershell
   Copy-Item apps/shika/.env.example apps/shika/.env.local
   ```

3. Apply the committed migrations to the ignored local database:

   ```powershell
   pnpm --filter shika db:migrate:local
   ```

4. Start Shika:

   ```powershell
   pnpm dev:shika
   ```

   The development command uses webpack with a 1 GiB Node heap ceiling. This avoids the Turbopack loader path that has produced invalid CSS/TSX transform dispatch on Windows and ensures a runaway compiler exits without exhausting host memory.

Open `http://localhost:3000`. The public routes are `/`, `/history`, and `/incidents/[id]`; the owner entry is `/login`, the authenticated console is `/admin`, and `/api/health` exposes a non-cached dependency-readiness response without private data.

Shika keeps those URLs locale-neutral. A first visit chooses English or Simplified Chinese from `Accept-Language`; the visible language switcher stores an explicit override in the secure, HTTP-only `shika-locale` cookie. Interface copy, status vocabulary, dates, and system feedback are localized. Owner-authored titles, summaries, and notes remain exactly as written and are never translated implicitly.

`.env.local`, `.data/`, OAuth credentials, tokens, and other runtime data must never be committed.

## Validation

Run the owning checks and production build from the repository root:

```powershell
pnpm --filter shika check
pnpm --filter shika build
```

`check` runs ESLint, Next.js type generation, TypeScript, the Node.js test suite, and Drizzle migration consistency checks. More focused commands are available as `lint`, `typecheck`, `test`, and `db:check` in [`package.json`](./package.json).

The dedicated `[Project] Shika CI` workflow also migrates a temporary SQLite database, seeds public and private profile, component, incident, and maintenance canaries through the production command layer, builds the app, starts `next start` in an isolated process, verifies `/api/health`, and requests `/`, `/history`, and `/incidents/[id]` as both HTML and React Server Component payloads. It requires route-relevant public canaries to render, rejects every private canary, verifies English and Simplified Chinese language negotiation plus cookie precedence, verifies that anonymous HTML and RSC requests to `/admin` return only the owner-login redirect, checks that `/login` remains reachable, and rejects data responses that permit shared caching; it does not require live OAuth credentials, Turso access, or a browser binary.

## Database changes and deployment

Migrations are generated, reviewed, tested locally, and then applied to Turso as an explicit release step. They never run during serverless request startup. Environment separation, GitHub callback URLs, Turso commands, provider IP headers, release verification, recovery, and troubleshooting are documented in [`docs/operations.md`](./docs/operations.md).

## Product and architecture contracts

- [`docs/product-contract.md`](./docs/product-contract.md) owns the single-owner product model, status semantics, publication rules, and privacy invariants.
- [`docs/information-architecture.md`](./docs/information-architecture.md) owns route order, owner and visitor flows, text wireframes, accessibility, and visual decisions awaiting maintainer review.
- [`docs/architecture.md`](./docs/architecture.md) owns technical boundaries, persistence, authentication, migration strategy, testing, and deployment policy.
- [`docs/operations.md`](./docs/operations.md) owns executable environment, migration, deployment, recovery, and troubleshooting procedures.

## License

Shika is licensed under the Apache License 2.0. See [`LICENSE`](./LICENSE).
