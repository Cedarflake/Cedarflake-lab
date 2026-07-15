# Shika Architecture

Status: Draft aligned with the product contract

## System boundary

Shika is one Next.js application with one owner and one anonymous public audience. It uses an external libSQL database but owns its schema, authorization rules, public projections, and migrations.

```text
Anonymous request ──> public page ──> public DAL ──> public DTO ──> Turso

GitHub OAuth ──> Better Auth ──> requireOwner ──> owner DAL/commands ──> Turso
                                      │
                                      └─ repeated at every private read/write boundary
```

Authentication proves identity. Authorization remains a Shika rule and compares the authenticated provider account with the configured numeric GitHub owner ID.

## Runtime stack

- Next.js 16 App Router and React 19
- TypeScript strict mode
- next-intl request configuration with English and Simplified Chinese catalogs
- Tailwind CSS 4
- Better Auth with GitHub OAuth
- Turso/libSQL through the HTTP-compatible `@libsql/client` transport
- Drizzle ORM and reviewed SQL migrations
- Zod or an equivalent schema validator for runtime inputs and environment configuration
- Node.js test runner through `tsx` for low-overhead domain and integration tests
- an isolated-browser release acceptance suite is planned after the visual and deployment targets are approved; Playwright is not currently installed or part of CI

Remote Turso commands use `client.transaction("write")`. Local `file:` and
`:memory:` commands issue `BEGIN IMMEDIATE` on the client connection instead.
In `@libsql/client` 0.17.4 the SQLite transaction object detaches the native
database handle, but its post-commit `close()` does not close that handle; the
local strategy therefore preserves both schema visibility and deterministic
resource cleanup. Transaction integration tests still include a disposable
`file:` database so close/reopen behavior remains covered.

Dependencies must be pinned through the repository lockfile and installed with the repository-declared pnpm version.

Local development deliberately uses `next dev --webpack` behind a 1 GiB V8 heap ceiling. Turbopack development compilation is not an approved Shika path: under the Windows workspace it has dispatched generated font CSS and TSX modules through incorrect PostCSS/webpack-loader transforms and exhausted host virtual memory. Production builds remain single-worker and are verified in the isolated project CI. Geist Sans and Geist Mono are self-hosted static WOFF2 assets, so typography does not depend on `next/font` loader evaluation.

## Source layout

The intended ownership boundaries are:

```text
src/
├── app/
│   ├── api/auth/[...all]/route.ts
│   ├── incidents/[id]/page.tsx
│   ├── history/page.tsx
│   ├── login/page.tsx
│   ├── auth-error/page.tsx
│   ├── admin/page.tsx
│   ├── locale-actions.ts
│   └── page.tsx
├── components/
│   ├── public/
│   ├── admin/
│   ├── auth/
│   ├── i18n/
│   └── ui/
├── i18n/
│   ├── config.ts
│   ├── request.ts
│   └── resolve-locale.ts
├── messages/
│   ├── en.json
│   └── zh-CN.json
├── styles/
│   ├── fonts.css
│   ├── theme.css
│   ├── base.css
│   ├── site-shell.css
│   ├── locale-switcher.css
│   ├── action-links.css
│   ├── content-primitives.css
│   ├── indicators.css
│   ├── status-hero.css
│   ├── timeline.css
│   └── admin.css
├── domain/
│   ├── status.ts
│   ├── incidents.ts
│   ├── maintenance.ts
│   ├── timeline.ts
│   └── publication.ts
└── lib/
    ├── auth/
    │   ├── server.ts
    │   ├── client.ts
    │   └── requireOwner.ts
    ├── db/
    │   ├── client.ts
    │   ├── schema/
    │   └── repositories/
    ├── data/
    │   ├── publicStatus.ts
    │   └── adminStatus.ts
    ├── commands/
    └── env/

drizzle/
└── reviewed generated migrations
```

`src/app/globals.css` is an import-only entry shell. Design tokens, baseline browser rules, shared site chrome, action links, content primitives, status indicators, the public status hero, timelines, and owner-console styles live in the categorized files above. Route-specific rules must not accumulate in the entry file, and an existing category must be split when it starts owning unrelated UI concepts.

Framework-reserved route files keep their lowercase Next.js names. Other source names follow the nearest project and repository naming rules.

## Layer responsibilities

### Domain

`src/domain` contains pure types, state machines, ranking, freshness, projection, and validation rules. It has no React, Next.js, authentication, or database imports.

### Database

`src/lib/db` owns the Drizzle schema, lazy libSQL client creation, transactions, and low-level repositories. It does not decide whether a caller is authorized.

Database and external SDK clients must not initialize at module evaluation time. Separate lazy getters construct both the libSQL client and the Better Auth instance only when a request path needs them. Each getter validates only its required runtime environment, allowing CI builds to load without production secrets while affected requests still fail closed.

### Data access

The public and owner data-access modules are deliberately separate:

- Public functions encode publication-state predicates in their SQL and map explicit public DTO fields.
- Owner functions call `requireOwner()` before reading complete records.
- Public call sites cannot import owner repository helpers through a shared barrel.

The application never loads complete records into a Client Component and filters private fields there.

### Commands

Server Actions are the default for owner form mutations. Route Handlers are reserved for authentication, externally consumed endpoints, and behavior that Server Actions cannot represent cleanly.

Every command validates owner authorization and input before starting a transaction. Versions are required for every existing aggregate or publication stream the command will mutate. Idempotency ownership, payload hash, all compare-and-swaps, domain writes, and the command receipt are enforced atomically inside the transaction.

### Presentation

Pages are Server Components by default. Client Components are limited to interactive form controls, optimistic feedback, and browser-only behavior. Public and owner error boundaries must not serialize caught server errors directly.

Locale resolution is request-scoped and remains independent of route structure. A valid `shika-locale` cookie takes precedence over the weighted `Accept-Language` header; unsupported and malformed preferences fall back to English. The language switcher writes the HTTP-only cookie through a Server Action, then refreshes the current route. Message catalogs own only interface and system copy. Database-backed owner-authored content is rendered unchanged, so localization cannot mutate or imply a translation of a private or public record.

## Persistence model

### Authentication tables

Better Auth owns:

- `user`;
- `account`;
- `session`;
- `verification`;
- `rate_limit` when database-backed global rate limiting is enabled.

Only the Better Auth `account` row carries the authorization identity: `(providerId = "github", accountId = normalized GITHUB_OWNER_ID)`. The `user` row is profile and session-linkage data; its ID, email, name, and image never grant access. The Better Auth configuration must set `account.encryptOAuthTokens: true`; token encryption is not assumed from library defaults. OAuth tokens are never included in session payloads or logs.

If database-backed rate limiting is enabled with the documented snake-case table, the Better Auth configuration must map its rate-limit model explicitly to `rate_limit`.

### Product tables

| Table                               | Responsibility                                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `site_profile`                      | Singleton identity and monotonic version.                                                                                   |
| `site_profile_revisions`            | Immutable owner copy, timezone, and public-snapshot candidates.                                                             |
| `components`                        | Component identity and concurrency guard; metadata, transitions, and public dependency changes increment its version.       |
| `component_revisions`               | Immutable name, ordering, lifecycle, expiry-default, and audience-copy snapshots.                                           |
| `status_transitions`                | Immutable component-condition reports and stable ordering fields.                                                           |
| `incidents`                         | Incident identity and monotonic version.                                                                                    |
| `incident_updates`                  | Authoritative append-only phase, severity, title, notes, metadata, and audience-copy revisions.                             |
| `incident_update_components`        | Authoritative owner component IDs, versions, revision IDs, and immutable owner-name snapshots for one incident revision.    |
| `incident_update_public_components` | Optional visitor-safe component IDs, public IDs/names, and metadata-publication versions for a published incident revision. |
| `maintenance_windows`               | Maintenance identity and monotonic version.                                                                                 |
| `maintenance_events`                | Authoritative append-only schedule, phase, copy, and metadata revisions.                                                    |
| `maintenance_event_components`      | Affected component IDs and immutable name snapshots for one maintenance revision.                                           |
| `publication_events`                | Append-only versioned publish, withdraw, redact, and suppress decisions for source revisions.                               |
| `command_receipts`                  | Permanent idempotency key, payload hash, result reference, and optional expiring response body.                             |
| `timeline_clock`                    | Singleton allocator for owner/public ordinals and the public privacy epoch; it stores no timeline content.                  |

All identifiers are opaque text identifiers. Effective and recorded timestamps are stored in UTC. Mutable aggregate roots carry only identity, creation metadata, and a monotonic integer `version`; `updatedAt` is display and audit metadata, never the compare-and-swap token. Current component metadata, incident phase/severity/references, and maintenance phase/schedule/references are derived from the latest authoritative revision rather than duplicated on root rows.

Every timeline-producing owner source receives a transactionally allocated `ownerOrdinal` that is never serialized publicly. A separate `publicOrdinal` is allocated only by a public-output change. Publication events are additionally unique on `(streamType, streamId, publicationVersion)`. Stable stream keys separate `site-profile`, `component-metadata:<id>`, `component-status:<id>`, `incident:<id>`, and `maintenance:<id>` concurrency. Commands compare the submitted `expectedPublicationVersion` with the latest stream event and insert the next version in one write transaction; a concurrent insert can only make one command succeed. A redacted or suppressed source revision is rejected permanently as a future publish source.

Redaction and suppression also increment `publicPrivacyEpoch`. Public cursors are opaque, server-validated encodings of the public upper bound and epoch. Every public timeline query applies the latest closure state before pagination; an epoch mismatch returns a reset response without records. Private writes change neither `publicOrdinal` nor `publicPrivacyEpoch`.

Creating or changing a public reference validates each component root version and `component-metadata` publication version under the same serialized write transaction. Adding or removing such a dependency increments the component version. Privatization and suppression re-read and guard the complete dependency set in that transaction, closing the parent-publication/component-privatization race.

The authoritative owner view is calculated from source revisions. The public view is calculated from explicit publication snapshots and events, including every public DTO field rather than only status. The first release has no cached owner/public projection, visibility, lifecycle, or current-phase columns and no second source of truth.

The timeline is a read projection over status transitions, incident updates, maintenance events, and their publication events. It is not a writable generic event table. The owner projection merges its three source tables by the globally unique `ownerOrdinal`, decorates each source record with its latest publication disposition, and paginates beneath an `asOfOwnerOrdinal` snapshot boundary; publication events are not rendered as independent owner rows, and a duplicate ordinal fails closed as an integrity error. The public projection may derive closure entries from publication events. Site-profile publication events configure public chrome and contribute to the last-public-change projection but intentionally carry no timeline entry or timeline snapshot. Every timeline-producing source event stores the snapshots needed by its audience, so later renaming or privatizing a component cannot rewrite owner or public history. If query volume later justifies materialization, the result must remain rebuildable from authoritative records.

## Transaction boundaries

The following operations are atomic:

- transition component: compare-and-swap the component version, append the transition, optional publication event, owner/public ordinals as applicable, and command receipt;
- save site profile: compare-and-swap the singleton version, append one immutable owner/public-draft revision, and write the command receipt without allocating a timeline ordinal;
- create incident: validate and increment every referenced component guard, create the root, initial authoritative update and affected snapshots, optional transitions/publication event, and receipt;
- update incident: validate affected component eligibility/guards, append a note, phase, severity, or relation revision, and compare-and-swap every involved version;
- resolve or reopen incident: compare-and-swap the incident and every selected component version, append the authoritative lifecycle update, and apply selected transitions;
- schedule or change maintenance: validate unarchived/public eligibility, compare-and-swap the window and every selected component guard, then append the authoritative event and selected transitions;
- publish an owner-only maintenance window: compare-and-swap the window, publication stream, component roots, and component-metadata publication streams; verify the exact current phase, schedule, timezone, and references; append one new visitor-safe metadata event, publication event, ordinals, and receipt without copying earlier private events;
- publish, withdraw, redact, or suppress: compare-and-swap every publication stream and append the next publication event and public-safe snapshot;
- privatize a referenced component: either reject the command or atomically redact/suppress every historical dependency and close current parents as needed; normal withdrawal alone cannot hide retained history;
- execute a retry-prone command: claim or replay the permanent command key/hash and result reference in the same transaction as domain writes; only an optional serialized response expires.

A transaction failure leaves no partial timeline entry, lifecycle change, publication event, or receipt.
Transactions remain short and bounded; no owner interaction or non-database external network request occurs while a libSQL transaction is open.

## GitHub owner authentication

The implementation uses a GitHub OAuth App and Better Auth's GitHub provider.

The identity anchor is `(providerId = "github", accountId = normalized GITHUB_OWNER_ID)`. The configured ID is validated as a decimal numeric identifier and compared as a normalized string. Login, email, Better Auth user ID, display name, and avatar are profile data and must never authorize access.

Authorization is enforced at four levels:

1. The OAuth callback rejects a different numeric GitHub account before it can receive an authorized session.
2. Account and session creation paths fail closed unless the persisted GitHub account tuple matches the configured owner.
3. `requireOwner()` validates the current database session and provider account on every private server boundary.
4. Public repositories remain incapable of selecting private records even when called without an authenticated session.

`proxy.ts` is not required for the first release. If added later, it may optimize anonymous redirects but cannot replace page, command, Route Handler, or data-access authorization.

The initial session policy is a seven-day database session with rolling renewal and no long-lived cookie cache. This permits immediate sign-out, revocation, and owner-ID changes.

## Environment contract

The committed `.env.example` describes these server-only values:

```text
BETTER_AUTH_SECRET
BETTER_AUTH_URL
GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
GITHUB_OWNER_ID
AUTH_CLIENT_IP_HEADER
PUBLIC_TIMELINE_CURSOR_SECRET
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
```

No secret uses a `NEXT_PUBLIC_` prefix. Development, staging, and production use separate OAuth applications, authentication secrets, databases, and database tokens.

`BETTER_AUTH_SECRET` and `PUBLIC_TIMELINE_CURSOR_SECRET` are independent secrets of at least 32 characters. `AUTH_CLIENT_IP_HEADER` is optional for local development and mandatory in production; the runtime accepts only the provider-specific headers documented in [`operations.md`](./operations.md). A local `file:` database needs no auth token, while every remote database URL requires one.

The GitHub callback is:

```text
<BETTER_AUTH_URL>/api/auth/callback/github
```

Ephemeral pull-request previews receive neither production authentication secrets nor production database credentials. A fixed staging host is used for real OAuth verification.

Executable setup, migration, deployment, and troubleshooting procedures live in [`operations.md`](./operations.md).

## Caching and freshness

Correctness and privacy take priority over caching. Every data-bearing public HTML response, RSC payload, and public Route Handler response in the first release is dynamic and `no-store`; auth and admin data responses are also never shared. Fingerprinted JavaScript, CSS, font, and image assets retain normal immutable caching. This remains mandatory until withdrawal, redaction, and suppression tests prove end-to-end purge behavior.

If public caching is introduced in a later release:

- only an already-filtered public DTO is cached;
- public status and timeline use explicit cache tags;
- a public-impacting command invalidates those tags after commit;
- a private-only command does not invalidate or perturb public output;
- owner reads are uncached or request-scoped, never shared across users;
- auth and admin responses are not CDN cached.

## Error and privacy behavior

- Missing runtime configuration fails closed on the affected private or data route with a controlled error.
- Public rendering never falls back to owner data when a public query fails.
- Private detail probes return not found.
- Withdrawal, redaction, and suppression fail closed: an ambiguous publication state produces no public record.
- A public aggregate cannot select a private component relation; the database command blocks or atomically removes public dependants first.
- Logs use request IDs, event type, result, environment, actor category, and opaque entity IDs.
- Logs omit cookies, OAuth codes and tokens, secrets, database URLs, public/private body copy, and raw caught errors containing those values.
- `/api/health` executes a minimal database readiness query and returns only `ok` or `unavailable`; it is dynamic, non-cached, and never returns private records, configuration, secret material, or raw errors.

## Migration strategy

Drizzle schema and generated SQL migrations are committed together. The migration process is:

1. change the typed schema;
2. generate a migration with the repository-pinned tool;
3. review the SQL and snapshots;
4. prove the full chain against an empty disposable database;
5. prove the forward migration against representative non-production data;
6. back up production or record a recovery point;
7. apply the production migration as an explicit deployment step;
8. deploy compatible application code and run a smoke test.

Serverless request startup never runs migrations. Destructive changes use expand, compatible deploy, data transition, and contract phases so an application rollback does not require an immediate database rollback.

Migration `0003_split_incident_public_components.sql` separates incident references without discarding existing data. It first copies every complete legacy public-reference tuple into `incident_update_public_components`, then rebuilds `incident_update_components` with owner-only columns. The checked migration path covers both a new database and the representative `0000` through `0002` schema upgraded to `0003`, including `PRAGMA foreign_key_check` after the upgrade.

## Test strategy

### Unit

- stable status ranking, expiry, withdrawal, and the no-fallback-to-old-green invariant;
- owner/public projections and complete, partial, none coverage edge cases;
- incident and maintenance state machines, reasoned nonterminal incident transitions, and explicit reopen behavior;
- overall status derivation;
- owner timeline private-record inclusion, exposure decoration, `asOfOwnerOrdinal` snapshot isolation, stable pagination, historical name snapshots, and duplicate-ordinal failure;
- public timeline merge, `asOfPublicOrdinal` snapshot isolation, privacy-epoch reset, equal timestamps, and backdated events;
- publication state and public DTO mapping;
- owner-ID comparison and missing-configuration failure.

### Database integration

- empty-database migration chain;
- atomic command success and rollback;
- same-key/same-payload replay and same-key/different-payload rejection;
- create-command replay after the optional response body has expired;
- aggregate and per-component integer-version optimistic concurrency conflicts;
- publication-version races where only one concurrent publish/withdraw/redact/suppress succeeds;
- concurrent public-parent creation and component privatization where only a privacy-safe result commits;
- redacted and suppressed source revisions cannot be republished;
- public SQL predicates and private-data canary tests;
- public DTOs remain byte-identical after private owner-revision edits;
- private-only writes do not change public ordinals, cursor bytes, timestamps, or privacy epochs;
- stale public cursors return no records after redaction or suppression changes the privacy epoch;
- private-maintenance publication creates only a new reviewed snapshot, rejects schedule tampering, supports withdrawal/redaction revision publication, and treats suppression as terminal;
- public incident and maintenance phase updates do not sweep unpublished metadata drafts into their snapshots;
- incident resolution and maintenance start/completion commit every explicitly selected private or public component-status transition atomically, including rollback on a stale status-publication guard;
- no-fallback projection behavior after expiry, withdrawal, redaction, suppression, resolution, and maintenance transitions;
- public-parent/private-component rejection and atomic privacy redaction or suppression;
- archived-component rejection for new references, transitions, reopen, and maintenance lifecycle commands;
- no public live joins to later-private component names or identifiers.

### Authentication integration

- owner account creates a valid session;
- non-owner account is rejected without an authorized session;
- revoked, expired, forged, and owner-ID-mismatched sessions fail;
- each private page, command, Route Handler, and DAL entry checks authorization.

### Browser release acceptance

The following checklist is a required fixed-staging release gate, not a claim about the current automated test suite:

- first-use setup;
- owner login, logout, and session-expiry recovery;
- quick status update and public preview;
- incident creation, update, and resolution;
- maintenance schedule, start, completion, and cancellation;
- keyboard-only operation, focus restoration, mobile layout, and reduced motion;
- public HTML, React payloads, endpoints, and caches contain no private canary.

Browser automation uses an isolated headless Chromium and Firefox context. It never opens, reuses, closes, or kills a user-owned browser or profile.

## CI ownership

The dedicated `[Project] Shika CI` workflow owns Shika lint, type-check, unit and database integration tests, migration consistency, build, and production-route smoke coverage. The shared Apps & Packages workflow excludes `apps/shika/**` in both its trigger and pnpm filters so unrelated workspace changes do not run Shika twice.

The project workflow runs for `apps/shika/**`, its own workflow file, the root package manifest, the lockfile, the pnpm workspace configuration, or a manual dispatch. It installs only the Shika dependency closure, executes `shika check`, migrates a disposable SQLite database, seeds public and private profile, component, incident, and maintenance canaries through the command layer, builds the application, verifies the exact non-cached `/api/health` response, and checks `/`, `/history`, and `/incidents/[id]` as both HTML and React Server Component payloads. It also requires `/login` to remain reachable and verifies that anonymous HTML and RSC requests to `/admin` produce only the exact owner-login redirect. The smoke must find every route-specific public canary, reject every private canary including owner-only incident severity from both public and owner-access responses, and reject a data response that permits shared caching. It uses no production secret, OAuth exchange, Turso database, or user-owned browser.

Root inputs that can change Shika's resolved dependency closure or runtime automatically match the project workflow. Unrelated repository changes still do not run Shika CI. Full owner-authentication and interaction acceptance remains a separate isolated-browser release check; any future browser workflow must use disposable profiles and must not expose production credentials to pull requests.

## Deployment and recovery

The application remains portable across supported Next.js hosts. The first production host is selected separately; provider-specific adapters are added only for that chosen host.

Required environments:

- development database and local OAuth App;
- optional fixed staging database, host, and OAuth App;
- production database, canonical host, and OAuth App.

Production release requires reviewed migrations, a recovery point or encrypted export, environment validation, owner login/logout smoke tests, public/private canary checks, and a reversible test mutation.

Application rollback and database recovery are independent. A periodic encrypted export outside the repository complements Turso recovery features, and restoration must be tested against a new database before release rather than assumed from the runbook.

## Documentation ownership

- This file owns technical architecture and operational boundaries.
- `product-contract.md` owns product semantics and privacy invariants.
- `information-architecture.md` owns route order, user flows, wireframes, and interaction review points.
- The project README owns setup, commands, current status, limitations, and deployment instructions.
- `operations.md` owns executable environment, migration, deployment, recovery, and troubleshooting procedures.
- Root repository documentation and Landing are updated only for facts they independently present, and a Live URL is added only after a real deployment is verified.
