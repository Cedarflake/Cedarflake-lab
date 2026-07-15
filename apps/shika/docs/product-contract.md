# Shika Product Contract

Status: Draft for maintainer review

## Purpose

Shika applies the operating model of a network service status page to one person's self-reported state. It gives visitors a deliberately limited public view and gives the owner a complete private view and a small operational console.

Shika is not a social feed. Its public history explains changes to reported state; it does not create a second stream of free-form posts.

## Actors and surfaces

Shika has exactly two actors:

- A visitor is anonymous and can read only explicitly published information.
- The owner is the single GitHub identity allowed to authenticate and can read and operate both public and private information.

The first release has two primary surfaces:

- `/` and public detail/history routes expose the published status projection.
- `/admin` exposes the complete owner projection and all mutations.

## Non-goals

The first release must not introduce:

- registration or multiple users;
- organizations, workspaces, teams, roles, invitations, or billing;
- user-selected public profile paths or usernames;
- followers, reactions, comments, direct messages, or a general-purpose activity feed;
- automated health tracking, surveillance, or inferred personal state;
- SLA, uptime-percentage, or productivity scoring;
- repository access through GitHub beyond the identity data required for sign-in.

## Vocabulary

### Status component

A status component is an owner-defined area that can be reported independently, analogous to a service component. Examples may include availability, energy, work, or creative activity. The final user-facing noun is an open decision; the internal model uses `component`.

### Status transition

A status transition is an immutable report that gives one component a condition from an effective time. A correction is a later transition; historical transitions are not edited in place.

### Site profile

The site profile is one singleton owner record for the public site's title, summary, and timezone. Its owner copy and private note remain separate from an optional visitor-safe draft. The first release fixes the timezone to `Asia/Shanghai`; it is displayed as read-only rather than treated as an editable preference.

### Incident

An incident explains an unplanned condition over time. It has affected components and an append-only sequence of updates. Phase-changing updates form its authoritative lifecycle; private operational notes may be attached without changing that lifecycle.

### Maintenance

A maintenance window represents a planned period of reduced availability, rest, or deliberate interruption. Its lifecycle is recorded through append-only maintenance events and remains separate from component condition.

### Publication event

A publication event is an append-only decision to publish, withdraw, redact, or suppress an audience-safe snapshot of a source revision. Publication does not rewrite the authoritative owner record. Each target has a monotonic `publicationVersion`; a publication command must compare-and-swap the version it was reviewed against.

### Timeline

The timeline is a read model assembled from status transitions, incident updates, maintenance events, and their publication state. It is not an independently authored content type.

## Status model

The proposed first-release component conditions are:

| Code          | Meaning                                                  |
| ------------- | -------------------------------------------------------- |
| `available`   | The component is operating as normally reported.         |
| `limited`     | The component is available with a noticeable limitation. |
| `degraded`    | The component is substantially impaired.                 |
| `unavailable` | The component is currently unavailable.                  |

`maintenance` is not a condition. An active maintenance window is a separate flag so a component can, for example, be available during maintenance or unavailable for an unrelated reason.

`unknown` is not stored. It is derived when no audience-eligible transition exists or when the selected transition is expired or no longer published for that audience.

Condition severity is strictly ordered `unavailable > degraded > limited > available`. `unknown` does not participate in that maximum; coverage reports missing information separately.

Every transition stores immutable `effectiveAt`, `recordedAt`, internal `ownerOrdinal`, and optional `validUntil` values. `recordedAt` and the owner-only globally monotonic ordinal are assigned by the server. A validity interval is half-open `[effectiveAt, validUntil)`, so a supplied `validUntil` must be later than `effectiveAt`.

## Current-state projection

The projection algorithm is deliberately identical in shape for owner and visitor views:

1. Build the audience-eligible set. The owner set contains every transition for the component. The public set contains transitions that have been published at least once for a currently public component; withdrawn records remain candidates so an older green state cannot reappear.
2. Keep only transitions with `effectiveAt <= now`.
3. Select exactly one latest candidate using the stable descending order `(effectiveAt, recordedAt, audienceOrdinal, audienceSafeId)`. The owner projection supplies the source `ownerOrdinal` and internal transition ID; the public projection supplies the publication event's `publicOrdinal` and snapshot `publicEntryId`, so private ordinal gaps and source identifiers never influence public bytes.
4. If no candidate exists, return `unknown`.
5. For a public projection, inspect the selected transition's latest publication event by `publicationVersion`. If it is withdrawn, redacted, or suppressed, return `unknown`.
6. If the selected transition has `validUntil <= now`, return `unknown`.
7. Otherwise return the selected condition.

Expiry and withdrawal are evaluated after selecting the latest candidate. They must never be placed in a query filter that falls back to an older `available` transition.

Redaction cannot supply or replace a component condition. A replacement public condition always requires a new immutable transition and an explicit publication event.

A private transition changes only the owner projection. It does not enter the public candidate set and must not hint that an undisclosed change exists. Making a component public does not publish its private history; the owner must explicitly publish a public starting transition.

## Overall status

The first release derives overall status and has no manual override.

The owner overall status uses unarchived owner-visible components. The public overall status uses unarchived, currently published components. Both results contain:

- `condition`: the most severe fresh component condition, or `unknown` when none is fresh;
- `coverage`: `complete`, `partial`, or `none`;
- `hasActiveMaintenance`: whether at least one audience-visible maintenance window is explicitly in progress.

Coverage is calculated as follows:

- zero eligible components produces `none`;
- all eligible components have fresh projections produces `complete`;
- some, but not all, eligible components have fresh projections produces `partial`;
- eligible components exist but all projections are unknown produces `none`.

The public headline must not say everything is available when coverage is partial or absent. Private components, transitions, incidents, and maintenance must have no effect on any public result, count, freshness label, or warning.

Incidents and maintenance do not silently override component condition. A command that should change affected components submits explicit transitions and commits them with the lifecycle event.

## Freshness and public timestamps

Component freshness is derived only from the transition selected for that audience:

- a fresh projection shows the transition's `effectiveAt` and its absolute expiry when present;
- an expired projection shows that reporting expired at `validUntil`;
- an unknown projection with no candidate says it has not been reported;
- a private transition never changes public freshness text or timestamps.

The home-page “last public change” value is the latest public-visible instant that actually changed its projection: a source `effectiveAt`, an expiry `validUntil`, or a publish/withdraw/redact event's server `recordedAt`. This includes a site-profile publication-state change because it changes public chrome, even though site-profile events do not enter the timeline. Suppressed sources contribute nothing. The value is not the request time, database query time, or latest owner activity. An absolute Asia/Shanghai timestamp is always available; relative wording is supplementary.

## Visibility and publication

Owner-authored records default to private. Public exposure always requires an explicit publish selection, including when creation and publication occur in one command.

The following invariants apply:

1. Public data is filtered in SQL or the server data-access layer, never in a browser component.
2. Private fields are not serialized into public React payloads, APIs, metadata, structured data, logs, counts, or caches.
3. A request for a non-public detail resource returns `404`, not `403`.
4. Public copy and private notes are separate fields. A mixed field is never reused for both audiences.
5. Publishing existing content presents the exact source revisions, fields, and updates that will become public. Only explicitly selected updates are published; private history is never swept in automatically.
6. Publication, withdrawal, redaction, and suppression append `publication_events`; they do not mutate historical source rows.
7. A normal withdrawal closes public detail, removes the source from current discovery and projections, and appends one generic public-safe withdrawal timeline entry.
8. Redaction never assigns a replacement condition: it removes the selected transition's public condition, so that projection derives `unknown`, and replaces sensitive copy with a generic tombstone. A redacted source revision is terminal and cannot be republished; corrected public content requires a new source revision.
9. Emergency suppression removes the target and its dependants from all Shika public discovery, timeline, counts, metadata, and payloads without a tombstone.
10. None of these actions claims to erase copies already saved by browsers, archives, or third parties.

Every field in a public DTO comes from an explicitly published source-revision snapshot. This includes component names and ordering, site copy, incident title/severity/references, maintenance title/schedule/references, and all summaries. Editing the owner revision never changes public bytes. The owner either saves a private draft or explicitly publishes the new revision; a public lifecycle phase change is the only operation that must publish atomically to keep the single phase truthful.

Publishing a component requires an explicitly selected or newly created starting transition in the same transaction. The first release does not publish a component whose initial public condition is `unknown`.

A public incident or maintenance window may reference only currently public components. Making a referenced component private is blocked while any public dependent or historical snapshot still names it, whether that parent is active or terminal. The privacy flow must atomically redact or suppress every affected historical snapshot and reference; it may also withdraw current parents, but normal withdrawal alone is insufficient because it deliberately retains public history. The resulting public response must reveal neither the private component ID, name, nor the number of removed references. Archiving remains the non-retroactive alternative when published history should stay public.

Publication events for one target are ordered by their unique monotonic `publicationVersion`; `recordedAt`, owner-only `ownerOrdinal`, and `id` provide audit order. Every publish, withdraw, redact, or suppress command includes `expectedPublicationVersion`. A mismatch rejects the entire command. Redaction and suppression permanently close that source revision to future publish commands.

Publication concurrency is scoped by stable stream keys: site profile, component metadata, component status, incident, and maintenance. Component exposure and component-transition publication therefore use separate streams, while all public incident fields share one incident stream and all public maintenance fields share one maintenance stream. Each event names the exact source revision it exposes or closes.

Any command that creates or changes a public reference to a component must carry and transactionally validate both the component version and its `component-metadata` publication version, even when it does not otherwise edit that component. Adding or removing a public dependency increments the referenced component's version. A component privatization/suppression command rechecks its dependency set and versions inside the same serialized write transaction. Therefore a concurrent parent publication and component privatization cannot both commit from stale views.

The first release renders public data with `no-store`. Shared caching may be introduced only after automated tests prove withdrawal, redaction, and suppression purge semantics.

## Incident lifecycle

The proposed severity values are `minor`, `major`, and `critical`. The proposed phase rules are:

| From                                           | To                              | Requirement                           |
| ---------------------------------------------- | ------------------------------- | ------------------------------------- |
| `investigating`, `identified`, or `monitoring` | Any different nonterminal phase | Append a reasoned phase update.       |
| Any nonterminal phase                          | `resolved`                      | Use the resolution command.           |
| `resolved`                                     | `investigating`                 | Use the reopen command with a reason. |

Every other phase transition is invalid. The nonterminal rule handles renewed investigation without falsifying history.

An incident is created with a title, severity, one or more affected components, an initial phase update, owner-only notes where needed, and optional explicitly selected publication data.

The console treats `Update`, `Details`, and `Public record` as separate incident tasks. `Details` appends a metadata revision for title, severity, copy, and affected components without also advancing the lifecycle. Saving that task privately changes only the owner revision and must leave the current public snapshot byte-identical. Publishing from `Details` exposes the explicitly reviewed public fields and public component set in one new snapshot.

Each incident has one authoritative phase. If the incident is public, every phase-changing update is also public. A private operational note on a public incident cannot change phase. To continue an incident privately, the owner must first withdraw the public incident; public history must then show a withdrawal rather than remaining indefinitely active.

A public phase command starts from the latest public snapshot and applies the new phase and explicitly entered public copy. It does not inherit unpublished owner drafts for title, severity, or affected components unless the confirmation explicitly selects those revisions.

Each incident update therefore stores two independent affected-component tracks: the authoritative owner references and, when that update is published, immutable visitor-safe public references. The tracks may name different component sets. A later public lifecycle update copies the references from the last published incident snapshot, while its owner record continues from the latest owner references; it never derives public references from an unpublished `Details` revision.

Changing severity or affected components increments the incident version and appends an audit update containing an audience-safe snapshot. A public incident may never gain a private component reference.

Creating or changing affected components requires every referenced component to be unarchived. Reopening a resolved incident revalidates the same condition; an archived component must first be explicitly unarchived or replaced in the reviewed command.

Resolving an incident does not restore component condition automatically. The resolution flow shows current component states and requires explicit recovery choices. The phase update, selected component transitions, publication events, aggregate version increment, and command receipt commit atomically.

## Maintenance lifecycle

The proposed maintenance phase machine is:

```text
scheduled -> in_progress -> completed
    |             |
    +-------------+-> cancelled
```

Scheduling stores UTC `startsAt` and `endsAt`, requires `startsAt < endsAt`, and appends a `scheduled` maintenance event. Clock time alone never starts, completes, or cancels maintenance. The owner console warns about an overdue scheduled or in-progress window, but only an explicit command changes phase.

Rescheduling is valid only from `scheduled`; starting only from `scheduled`; completing only from `in_progress`; cancelling only from `scheduled` or `in_progress`. Terminal windows cannot change phase. Every operation appends a maintenance event and increments the window version. Starting may create explicit component transitions in the same transaction. Completion requires explicit recovery choices. A public phase-changing event is public; private notes cannot change the phase of a public maintenance window.

As with incidents, a public maintenance phase command starts from the latest public schedule/reference snapshot and cannot sweep unpublished owner edits into public output.

An existing owner-only maintenance window may be published only through an explicit publication command. The command appends a new metadata source revision, requires separately entered visitor-safe title and summary copy, and must match the current authoritative schedule, timezone, phase, and affected-component set exactly. It publishes no earlier owner-only event. Every referenced component must have current public metadata, and the maintenance root, maintenance publication stream, component roots, and component-metadata publication streams are all compare-and-swapped in the same transaction. A withdrawal or redaction may be followed by a newly appended and reviewed publication revision; emergency suppression terminates the stream permanently.

A maintenance window may reference only unarchived components; a public window additionally requires them to be public. Completed and cancelled windows remain historical records and are not physically deleted.

## Timeline contract

The public timeline retains previously published, non-redacted historical snapshots after a normal withdrawal and adds its generic withdrawal entry; only current discovery, detail, and projection close. Redacted snapshots are replaced by tombstones. Suppressed targets and all their dependants are excluded completely. The owner timeline retains every owner source record and labels its exposure. Its pagination uses the global owner ordinal as a stable snapshot boundary, so later writes cannot shift records between already-addressed pages.

Site-profile revisions and publication events are deliberately absent from owner and public timelines because they configure public chrome rather than report a status event. An explicit site-profile publish, withdrawal, or redaction still changes public chrome and participates in the page-level “last public change” calculation.

Every owner entry contains:

- a stable `entryId`, source identifier, source type, source revision, and correlation identifier;
- immutable `effectiveAt`, `recordedAt`, and owner-only `ownerOrdinal` values;
- an immutable owner-facing summary and optional private note;
- immutable owner affected-component snapshots where applicable;
- the current exposure disposition for that source revision;
- a public detail link only while that detail is currently public.

The public DTO replaces owner source identifiers, revisions, and ordinals with a public-safe `publicEntryId` and a `publicOrdinal` allocated only when public output changes. Private-only activity allocates no public ordinal and cannot alter public cursor bytes or reveal gaps.

Public ordering uses `(effectiveAt, recordedAt, publicOrdinal, publicEntryId)`. The first page returns an opaque server-validated cursor containing `asOfPublicOrdinal` and the current privacy epoch; pages in that cursor filter to the public upper bound. Equal timestamps and backdated public records therefore have deterministic placement without duplicates or omissions inside one privacy epoch.

Redaction and suppression increment the privacy epoch and always apply from the latest publication state, regardless of an older cursor. A stale-epoch cursor returns a reset result instead of any page data. The client refreshes from page one. Privacy closure takes precedence over snapshot continuity.

Public timeline entries never reconstruct their labels by joining the current component row. They use the public-safe snapshot recorded with the event, so later renaming, archiving, or privatizing a component cannot disclose current private data or rewrite history accidentally.

The first release has no free-form timeline posts and no materialized timeline table. The read model remains rebuildable from authoritative records and publication events.

## Command contract

All owner mutations must:

1. authenticate and authorize the owner at the server boundary;
2. validate an explicit input schema;
3. include the monotonic integer `version` of every existing aggregate it will write or whose current reference eligibility it relies on;
4. include `expectedPublicationVersion` for every publication target it will change;
5. include an idempotency key for retry-prone submissions;
6. execute related writes and the idempotency receipt in one short database transaction;
7. reject any stale aggregate or publication version and roll back the entire command without discarding the submitted draft;
8. invalidate public data only when public output changes;
9. return a typed success or recoverable error without exposing secrets or private content.

Every component mutation, including a status transition, increments that component's version. Incident resolution and maintenance start/completion therefore carry the reviewed incident or maintenance version plus the version of every component receiving a transition. Any concurrent quick update causes an atomic conflict instead of being overwritten.

`command_receipts` permanently retains the minimal unique `(ownerKey, action, idempotencyKey)`, canonical payload hash, result reference, and creation time. `ownerKey` is the stable internal constant `github:<normalized numeric account ID>`, never a replaceable Better Auth user ID. A retry with the same hash resolves to the recorded result; reuse with a different payload is rejected permanently, including for create commands. An optional serialized response body may expire after 24 hours, but the deduplication key, hash, and result reference are not deleted.

The core commands are:

- create, update, reorder, archive, publish, withdraw, privacy-redact, or emergency-suppress a component;
- transition a component condition;
- create an incident and initial update;
- append an incident note or phase update;
- change incident severity or affected components;
- resolve or explicitly reopen an incident with selected component transitions;
- schedule, reschedule, start, complete, cancel, publish, withdraw, privacy-redact, or emergency-suppress maintenance;
- publish, withdraw, privacy-redact, or emergency-suppress an eligible historical record;
- save a singleton site-profile revision, publish its exact visitor-safe draft, or withdraw, privacy-redact, or emergency-suppress its public snapshot.

## Retention and deletion

- Status transitions, incident updates, maintenance events, and publication events are append-only in normal operation.
- A component referenced by an active incident or in-progress maintenance window cannot be archived. Scheduled maintenance also blocks archival until it is cancelled or its reference is changed.
- Resolved incidents and completed or cancelled maintenance do not block component archival.
- Archiving removes a component from current eligible coverage but does not withdraw already published historical snapshots.
- Archiving a currently public component is an explicitly public-impacting command: it closes the current component-metadata and component-status projections atomically while retaining public history. Unarchiving is owner-only until a new public metadata revision and starting transition are explicitly published.
- An archived component cannot receive a new transition or new incident/maintenance reference. It must be explicitly unarchived first.
- Withdrawal, redaction, and archival are distinct operations.
- Incidents and maintenance remain owner-addressable after reaching a terminal phase.
- The first release provides normal withdrawal, public-snapshot redaction, and emergency public suppression, but no bulk owner-history deletion.
- The interface states honestly that Shika cannot recall information already copied by external systems.

## Privacy and authorization invariants

- GitHub proves identity; Shika authorizes exactly one configured numeric GitHub account ID.
- The sole authority is the Better Auth account tuple `(providerId = "github", accountId = normalized GITHUB_OWNER_ID)`. Email, login, user ID, display name, and avatar never authorize access.
- A valid session without that current provider account is insufficient.
- Non-owner OAuth sign-in is rejected before an authorized session is created.
- Every private page, Server Action, Route Handler, command, and private data-access function performs its own owner check.
- Route middleware or proxy may improve redirects but is never the sole authorization boundary.
- Public queries select explicit public DTO fields and fail closed when publication state is absent or ambiguous.
- Private-only changes cannot alter public bytes, ordering, counts, cache keys, timestamps, or aggregate state.

## Product acceptance criteria

The product contract is satisfied when:

- an anonymous visitor can understand the current published state without signing in;
- private-only changes do not alter any public response byte or aggregate;
- an expired or withdrawn latest public transition produces `unknown` instead of reviving an older green state;
- maintenance is visible independently from condition;
- the owner can complete a common status update in one focused flow;
- incident and maintenance history explain public changes without a social feed;
- public parents cannot expose private component references;
- every multi-record operation is atomic and duplicate-safe within the documented receipt and version contract;
- same-key/different-payload retries and stale multi-tab edits are rejected safely;
- timeline pagination is deterministic for equal and backdated timestamps;
- withdrawal, redaction, and emergency suppression produce their documented public outcomes without leaking sensitive snapshots;
- private resource probing does not disclose existence;
- no multi-user or workspace abstraction appears in routes, schema, or copy.

## Proposed first-release decisions

Unless the maintainer changes them during review, implementation will use these scope decisions:

- no manual overall-status override;
- new authored records default to private and publication includes only explicitly selected revisions, except mandatory phase publication for an already-public lifecycle;
- no free-form records or 30/90-day SLA-style visualization;
- one authoritative incident and maintenance phase per aggregate;
- no cached current projections, materialized timeline, or shared public cache;
- public timestamps include an absolute Asia/Shanghai time and may add visitor-local relative wording;
- the public header exposes a restrained owner-access entry that reads `Sign in` for an anonymous visitor and `Admin` for an authenticated owner; it never reveals private owner data.

## Localization contract

- Shika supports English and Simplified Chinese interface copy without locale prefixes in public or owner URLs.
- A valid explicit locale cookie overrides browser negotiation; absent a supported preference, English is the deterministic fallback.
- Locale selection changes interface labels, enum vocabulary, dates, counts, and system feedback only.
- Owner-authored content is never translated implicitly, rewritten, or copied into another locale-specific record.
- Localization must preserve the same authorization, publication, caching, and private-data boundaries in every locale.

## Decisions requiring maintainer confirmation

1. The public noun for a component; the current recommendation is “status item” / “状态项”.
2. The four-condition set and final Chinese labels; the current recommendation is “正常 / 受限 / 欠佳 / 暂不可用”, with derived “未报告”.
3. The incident severity and phase labels, including whether the public wording should feel operational or more personal.
4. The default transition expiry; the current recommendation is a per-component default of 72 hours with an explicit per-update override.
5. Whether public empty incident and maintenance regions remain visible as concise normal-state messages.
6. The visual and interaction decisions listed in `information-architecture.md`.
