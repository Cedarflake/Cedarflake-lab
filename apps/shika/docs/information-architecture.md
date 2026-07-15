# Shika Information Architecture

Status: Draft for maintainer review

This document fixes content order and operational flows without choosing the final visual language. Boxes indicate hierarchy only; they do not approve cards, columns, buttons, icon weight, color, radius, shadow, or animation.

## Route map

### Public

| Route             | Responsibility                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| `/`               | Current public status, active incidents, public components, active/upcoming maintenance, and recent timeline entries. |
| `/incidents/[id]` | The public update history for one public incident. A private or unknown incident returns `404`.                       |
| `/history`        | Paginated public status, incident, and maintenance history.                                                           |

### Owner

| Route         | Responsibility                                                          |
| ------------- | ----------------------------------------------------------------------- |
| `/login`      | The only GitHub sign-in entry.                                          |
| `/auth-error` | A generic cancellation, authentication, or authorization failure state. |
| `/admin`      | The first-release operational console and first-use setup.              |

The first release keeps owner operations in one shallow console. On desktop, that console uses a master-detail workspace: a persistent left sidebar selects the module or record, and the right pane renders exactly one active view and mounts at most one operation form. Separate component, incident, maintenance, and settings routes should be introduced only when real complexity makes the single route harder to operate.

## Localization

- English and Simplified Chinese share the same locale-neutral routes; language changes never replace the current page or break a copied public URL.
- The public header, login and error surfaces, and owner console expose the same compact language switcher.
- A first request follows the browser language. An explicit selection persists across public and owner routes.
- Interface vocabulary, form labels, validation feedback, counts, and dates follow the selected locale.
- Owner-authored titles, summaries, and notes are displayed verbatim. Shika does not infer or generate translations for personal records.

## Public information order

The current published site profile supplies the public title, summary, timezone context, and document metadata shared by the home, history, and incident-detail routes. With no current profile publication, those routes use the product fallback without exposing owner fields. Within that public chrome, the home page must preserve this order on desktop and mobile:

1. Current public status and freshness.
2. Active public incidents.
3. Public status components.
4. Active and upcoming public maintenance, with in-progress windows first.
5. Recent public records.

The most important state must be visible without horizontal scrolling, a carousel, or opening a detail view.

## Visitor flow

1. Read the current public condition and whether reporting coverage is complete.
2. If an incident is active, understand its current public phase, impact, and latest public update.
3. Scan component-level state and freshness.
4. See any planned reduced availability.
5. Use recent records to understand how the current state developed.
6. Open a public incident or full history only when more context is needed.

Visitors never register, choose a workspace, or need to understand owner-only concepts.

## Owner flows

### Two publication layers

The console never collapses these two decisions into one “visibility” control:

- **Item exposure** answers whether the component itself has a current public metadata revision.
- **Update publication** answers whether this specific status transition is published.

A private component cannot receive a standalone public transition. Selecting “Publish this update” on one opens a composite “Publish item with starting report” flow that shows the component snapshot and exactly one selected/new starting transition. Private transition history is explicitly excluded. Cancelling leaves both layers private.

Component rows display item exposure, owner condition, and public condition in separate labeled columns. A public component may still receive an owner-only transition; that transition changes neither public condition nor public freshness.

### First use

The empty owner experience is a short setup flow rather than an empty dashboard:

1. Create the first component.
2. Choose its current owner condition.
3. Explicitly select and publish an initial public condition when desired.
4. Preview the public result.
5. Open the public page.

### Quick status update

This is the highest-frequency flow:

1. Choose a component.
2. Choose its new condition.
3. Choose owner-only or “Publish this update”; do not reuse the previous submission's choice implicitly.
4. Add an optional audience-appropriate summary and private note.
5. Set or confirm an expiry.
6. Review the owner and public projection changes.
7. Save one atomic transition.

On mobile, this flow must be reachable from the first viewport. Selecting it replaces the single active pane beneath the module selector; it does not stack a second form below the current task.

### Review owner history

`Owner timeline` is a first-level sidebar destination. It merges every owner status transition, incident update, and maintenance event, including records that were never public, in descending `ownerOrdinal` order. The first page fixes an `asOfOwnerOrdinal` boundary and older-page links carry both that boundary and the last rendered ordinal, so later writes cannot move records between pages.

Each entry may show its immutable owner summary, private note, owner affected-component snapshots, and current exposure label: owner only, published, withdrawn, redacted, or suppressed. A public-detail link appears only while the incident detail is currently public. Site-profile revisions remain outside this operational history.

### Create and advance an incident

Creation collects title, severity, affected components, initial phase, initial update, an explicit publication selection, and any explicit component transitions. A public incident can select only public components; selecting publication disables private components with an explanation.

The selected incident exposes separate `Update`, `Details`, and, when applicable, `Public record` tasks. `Update` owns notes and lifecycle actions; `Details` owns title, severity, copy, and affected-component revisions; `Public record` owns withdrawal, redaction, and suppression. The operator distinguishes:

- add a private or public note without changing phase;
- change the authoritative phase, which must publish when the incident is public;
- edit severity, title, or affected components as a private owner revision or an explicitly published revision;
- resolve with reviewed recovery transitions and every affected component version;
- reopen a resolved incident with a required reason.

An owner-only `Details` save does not alter the visitor snapshot. The owner and visitor affected-component sets are reviewed and stored independently, so a public lifecycle update continues from the last public set rather than an unpublished owner draft. The review step shows the owner result and exact public snapshot. A stale incident, component, or publication version rejects the whole command and keeps every field.

### Schedule and operate maintenance

Scheduling collects title, valid time range, timezone, affected components, an explicit publication selection, and separate public/private copy. A public window can select only public components. Scheduled times never change phase automatically.

The maintenance operator exposes only valid actions for the current phase: reschedule/start/cancel while scheduled, complete/cancel while in progress, and none after completion or cancellation. Starting and completing may include explicit component transitions and component versions. Cancellation is retained in history, and overdue windows receive an owner-only warning.

An owner-only maintenance window may later enter a separate `Publish` task. That task reviews the latest authoritative schedule, phase, and affected-component set, requires new visitor-safe title and summary copy, and publishes only that exact revision after confirmation. It never copies earlier owner-only events into public history. Every affected component must still have a current public metadata revision, and a stale maintenance, component, or publication version rejects the whole command. Withdrawal or redaction permits a later new revision to be reviewed and published; emergency suppression is terminal.

### Preview as a visitor

Before a private-to-public change, the owner can inspect the exact visitor projection. The console always distinguishes:

- public overall status;
- complete owner status;
- content that will newly become public.

The preview uses only public DTOs. It does not render owner data and hide fields with CSS.

### Manage the site profile

`Site settings` is a singleton workspace with three right-pane tasks:

- `Edit` saves the owner title, owner summary, private note, and an optional visitor-safe draft. Saving does not change any public route. The first release displays `Asia/Shanghai` as a read-only timezone.
- `Publish` reviews the current draft beside the current visitor snapshot and publishes only the exact current revision after explicit confirmation.
- `Public record` exposes only actions legal for the current publication state: withdraw, redact public history, or emergency suppression. Changing the selected action clears its confirmation, and suppression is terminal.

A site-profile publication changes shared public chrome and the page-level last-public-change value. It does not create a recent-record or history-timeline entry.

### Freshness display

- A fresh component says when the selected audience transition became effective and when it expires.
- An expired component says when its report expired; it does not show an older report as current.
- The page-level timestamp is “Last public change,” calculated from public-impacting effective, expiry, publish, withdraw, and redact events, including site-profile publication-state changes; emergency suppression intentionally contributes no public timestamp.
- Private edits, notes, and transitions never move a public timestamp.

## Public desktop wireframe

```text
┌──────────────────────────────────────────────────────────────┐
│ Published site title            Last public change: timestamp │
│                                                  [History]    │
├──────────────────────────────────────────────────────────────┤
│ CURRENT PUBLIC STATUS                                        │
│ [text + symbol]  Condition headline                          │
│ Coverage/freshness note and optional public summary          │
├──────────────────────────────────────────────────────────────┤
│ ACTIVE INCIDENTS                                             │
│ Title · phase · severity · updated time                      │
│ Affected components                                          │
│ Latest public update                              Details ->  │
├──────────────────────────────────────────────────────────────┤
│ STATUS COMPONENTS                                           │
│ Component       Status text       Freshness       Summary    │
│ Component       Status text       Freshness       Summary    │
├──────────────────────────────────────────────────────────────┤
│ ACTIVE + UPCOMING MAINTENANCE                                │
│ In-progress first · date/time · title · components · phase   │
├──────────────────────────────────────────────────────────────┤
│ RECENT RECORDS                                               │
│ Time · source type · concise public change                   │
│ Time · source type · concise public change       All history │
├──────────────────────────────────────────────────────────────┤
│ Status legend · time policy · optional owner entry           │
└──────────────────────────────────────────────────────────────┘
```

## Public mobile wireframe

```text
┌──────────────────────────────┐
│ Published title · Last change │
├──────────────────────────────┤
│ CURRENT PUBLIC STATUS        │
│ Symbol + condition text      │
│ Coverage and freshness       │
├──────────────────────────────┤
│ ACTIVE INCIDENTS             │
│ Title                        │
│ Phase · severity · time      │
│ Latest update       Details  │
├──────────────────────────────┤
│ STATUS COMPONENTS            │
│ Component                    │
│ Status text · freshness      │
│ ──────────────────────────  │
│ Component                    │
│ Status text · freshness      │
├──────────────────────────────┤
│ ACTIVE + UPCOMING MAINTENANCE│
│ In-progress first · date/time│
│ Title · affected components  │
├──────────────────────────────┤
│ RECENT RECORDS               │
│ Time · concise change        │
│ Time · concise change        │
│                    History   │
└──────────────────────────────┘
```

The mobile order matches the desktop order. Active incidents must not be hidden in a carousel, and a component's status must not require a tap to reveal.

## Public detail and history wireframes

```text
┌──────────────────────────────────────────────────────────────┐
│ Incident detail                                    [History] │
│ Title · authoritative phase · severity · started/updated     │
│ Published affected-component name snapshots                 │
├──────────────────────────────────────────────────────────────┤
│ UPDATES                                                      │
│ Absolute + relative time · phase/note · public summary       │
│ ...                                                          │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Public history                    [All] [Status] [Incident]   │
│ Snapshot captured at first page · newest effective time first│
├──────────────────────────────────────────────────────────────┤
│ Time · source type · public-safe snapshot                    │
│ Time · generic withdrawal or redaction tombstone             │
│                                         [Load older records] │
└──────────────────────────────────────────────────────────────┘
```

A withdrawn or suppressed incident detail returns `404`. A redacted detail shows only its public-safe tombstone. History pagination stays on the first page's opaque `asOfPublicOrdinal` and privacy epoch. Redaction or suppression invalidates an older epoch before returning records and asks the visitor to refresh from page one.

## Owner desktop wireframe

```text
┌──────────────────────────────────────────────────────────────┐
│ Shika Admin        Public preview                 Owner/Exit  │
├──────────────────────────────────────────────────────────────┤
│ SIDEBAR                │ ACTIVE PANE                       │
│ Overview               │ Current module or record         │
│ Owner timeline         │                                  │
│ Report status          │                                  │
├──────────────────────────────────────────────────────────────┤
│ INCIDENTS              │ One operation at a time:         │
│ Open incident          │ · overview                       │
│ Incident records       │ · create or update form          │
│                        │ · publish or privacy operation   │
│                        │                                  │
├──────────────────────────────────────────────────────────────┤
│ MAINTENANCE            │ Update · Publish · Public record  │
│ Schedule maintenance   │ replace one another in this pane; │
│ Maintenance records    │ forms never stack.                │
│                        │                                  │
├──────────────────────────────────────────────────────────────┤
│ COMPONENTS             │ Selected record tabs switch the  │
│ Create · records       │ one operation shown in this pane.│
├──────────────────────────────────────────────────────────────┤
│ CONFIGURATION          │ Site settings:                    │
│ Site settings          │ · Edit · Publish · Public record  │
├──────────────────────────────────────────────────────────────┤
│ Sidebar stays visible and scrolls independently when needed. │
├──────────────────────────────────────────────────────────────┤
│ URL state: view · item · task · timeline snapshot cursor   │
└──────────────────────────────────────────────────────────────┘
```

The sidebar is sticky within the viewport and independently scrollable when its record list is long. `view`, `item`, and `task` URL state makes the selected workspace addressable and preserves browser back/forward behavior. `Owner timeline` opens the unified private history in the same right pane and uses explicit snapshot cursor parameters for older records. Tabs inside the active pane may switch operations for the selected record, but only one form is mounted at a time. Site settings uses the same right pane and never stacks its edit, publish, and privacy forms.

A selected component exposes separate `Edit`, `Publish`, `Archive/Restore`,
single-report privacy, and whole-component privacy tasks only when each task is
valid. The whole-component privacy pane is an owner-only impact review: it lists
the exact metadata/status sources, incident and maintenance streams, and
collateral component dependency versions that the selected action will change.
Switching between withdraw, redact, and suppress replaces the reviewed payload
and clears every confirmation. A redacted component keeps this pane for a later
suppression upgrade; a suppressed component keeps a read-only terminal audit
state instead of making the task disappear.

## Owner mobile wireframe

```text
┌──────────────────────────────┐
│ Shika Admin    Preview · Exit│
├──────────────────────────────┤
│ Scrollable module selector   │
│ Overview · Status · records  │
├──────────────────────────────┤
│ ACTIVE PANE                  │
│ Current title and context    │
├──────────────────────────────┤
│ Exactly one selected form or │
│ overview is rendered here.   │
├──────────────────────────────┤
│ Record operation tabs remain │
│ inside the active pane.      │
├──────────────────────────────┤
│ Form replacement keeps one   │
├──────────────────────────────┤
│ clear task in view.          │
└──────────────────────────────┘
```

On narrow screens, the module selector becomes a horizontally scrollable control above the active pane. This preserves the same one-pane interaction model without forcing an unusably narrow permanent sidebar.

## Owner operation wireframes

### First item and public starting report

```text
┌──────────────────────────────────────────────────────────────┐
│ CREATE STATUS ITEM                                           │
│ Owner name · owner summary · default expiry                  │
│ Item exposure: (•) Owner only  ( ) Publish item              │
├──────────────────────────────────────────────────────────────┤
│ IF PUBLISHED                                                 │
│ Public name · public summary · public order                  │
│ STARTING REPORT: condition · effective time · expiry         │
│ Public report summary                                       │
│ “No earlier private report will be published.”              │
├──────────────────────────────────────────────────────────────┤
│ OWNER RESULT                  EXACT VISITOR PREVIEW           │
│ ...                           ...                             │
│                                         Cancel · Create/Publish│
└──────────────────────────────────────────────────────────────┘
```

Choosing “Owner only” creates no public component. Choosing “Publish item” requires the public component revision and starting report together; neither half can commit alone.

### Quick condition update

```text
┌──────────────────────────────────────────────────────────────┐
│ REPORT A CONDITION                                           │
│ Item [selector]   Item exposure [read-only badge]            │
│ Condition · effective time · expiry                          │
│ Destination: (•) Owner only  ( ) Publish this update         │
│ Public summary [only for publish] · Private note             │
├──────────────────────────────────────────────────────────────┤
│ OWNER CHANGE                  PUBLIC CHANGE                   │
│ New owner condition           Unchanged / exact new snapshot │
│ Reviewed item version         Reviewed publication version   │
│                                      Cancel · Save/Publish    │
└──────────────────────────────────────────────────────────────┘
```

For a private item, “Publish this update” is unavailable and is replaced by “Publish item with starting report,” which opens the composite flow above. The owner cannot accidentally publish prior private transitions.

### Incident and maintenance operators

```text
┌──────────────────────────────────────────────────────────────┐
│ INCIDENT                                                     │
│ Task: Update / Details / Public record                       │
│ Update: note · phase · resolve · reopen                      │
│ Details: title · severity · owner/public affected items      │
│ Public copy · private note · explicit recovery transitions   │
│ Owner result · exact visitor preview · reviewed versions     │
│                                      Cancel · Named action    │
├──────────────────────────────────────────────────────────────┤
│ MAINTENANCE                                                  │
│ Operation: reschedule / start / complete / cancel            │
│ UTC-backed time range · phase · affected items               │
│ Public copy · private note · explicit component transitions  │
│ Owner result · exact visitor preview · reviewed versions     │
│                                      Cancel · Named action    │
└──────────────────────────────────────────────────────────────┘
```

The incident operator permits any reasoned nonterminal phase move and a reason-required reopen from resolved. It distinguishes a private note from a phase-changing public update. The independent `Details` form shows whether metadata remains an owner draft or publishes a new public snapshot; private saves do not replace the public affected-component set used by subsequent lifecycle updates.

The maintenance operator renders only valid actions: reschedule/start/cancel for `scheduled`, complete/cancel for `in_progress`, and no lifecycle action for terminal phases. Incident and maintenance forms never accept archived components. Public forms additionally require public components; unavailable private choices remain visible only when an explanation is needed, never in a public payload. Reopening an incident with an archived affected component requires replacing it or explicitly unarchiving it first.

### Withdrawal, redaction, and suppression

The safety flow is an owner-only dependency review rather than a generic confirmation:

1. Select the public target and action.
2. Load the exact current publication version, referenced component versions/exposure versions, and every public dependant.
3. Preview the result for home, detail, history, metadata, and affected references.
4. Confirm the named action and its external-copy limitation.
5. Commit every publication event atomically with one idempotency key.
6. On conflict, retain the selection and notes, refresh the dependency preview, and require confirmation again.

| Action             | Home/current result                                                          | Detail result     | History result                                                           |
| ------------------ | ---------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------ |
| Withdraw           | Removed from current projection                                              | `404`             | Existing public snapshots remain, plus one generic safe withdrawal entry |
| Redact             | Sensitive snapshot removed; status condition becomes unknown when applicable | Generic tombstone | Generic tombstone, no sensitive fields                                   |
| Emergency suppress | No target, dependant, count, or timestamp trace                              | `404`             | No target or dependant trace                                             |

The owner impact review may show private IDs, names, and dependant counts because it is separately authorized. No public response may reveal those values after redaction or suppression.

## Loading, empty, and error behavior

### Loading

- Preserve the final content order with stable skeleton regions instead of a full-page spinner.
- Mark busy regions for assistive technology without repeatedly announcing progress.
- Disable owner submissions until both authorization and required data are confirmed.

### Empty

- No public component state means “No public status has been reported,” never “All systems normal.”
- The owner empty state leads directly to creating the first component.
- Incident and maintenance empty-state visibility remains a maintainer decision.
- An empty recent-records section states that no public changes have been recorded yet and still offers history only when a history route has content.

### Partial failure

- A failed incident query must not erase successfully loaded component state.
- If overall status cannot be calculated safely, show that it cannot currently be confirmed.
- The first release does not use shared public cache data; every displayed timestamp comes from the authoritative public projection.
- A failed public region offers a focused retry without replacing successful regions.
- A failed owner mutation retains the submitted draft, reports field or service errors without a false success state, and permits a safe retry with the same idempotency key.
- Errors never include private entity names, SQL, OAuth values, tokens, or stack traces.

### Authentication and authorization

- An anonymous `/admin` request goes to `/login` with a safe relative return path.
- A non-owner GitHub account receives a generic denial that does not identify the owner.
- An expired session preserves unsaved form input before asking the owner to sign in again.
- A private public-detail URL behaves as not found.

### Concurrent editing

Every update to an existing aggregate carries the version it was based on; every publication change also carries its publication version. A command that relies on a referenced component being public and unarchived carries those precondition versions even if it does not edit the component. Creation has no prior aggregate version but still carries a permanent idempotency key. A stale multi-tab submission shows the newer server version, retains the local draft, and never silently overwrites it.

## Confirmation rules

Blocking confirmation is required for:

- changing private content to public;
- publishing selected existing incident history;
- resolving an incident and applying recovery transitions;
- reopening a resolved incident;
- applying a bulk component condition change;
- archiving a component after confirming that no unresolved incident and no `scheduled` or `in_progress` maintenance window references it; such a reference blocks archival, and a public item preview shows that current metadata/status close while public history remains;
- cancelling maintenance;
- withdrawing previously public content;
- making a public component private after every naming historical dependant is redacted or suppressed; withdrawing current parents alone is not sufficient;
- public redaction;
- emergency public suppression, with an explicit warning that external copies cannot be recalled.

The action label describes the result, such as “Publish this incident,” instead of a generic “Confirm.” Dialog focus, keyboard operation, cancellation, and focus restoration are part of the acceptance criteria.

## Accessibility baseline

- Status always has text; color is never the only carrier of meaning.
- Heading and DOM order match the documented information order.
- Lists and tables use native semantics that survive responsive layout changes.
- Every form field has an associated label, description, and error relationship.
- Save results use restrained live-region announcements.
- Every owner operation is keyboard accessible with visible focus.
- Touch targets are approximately 44 by 44 CSS pixels or larger.
- Text and non-text contrast meet WCAG AA.
- Relative time is paired with an absolute timestamp and timezone using `<time>`.
- Motion follows `prefers-reduced-motion`; loading placeholders do not flash.
- Any future chart has an equivalent text or table representation.

## Visual and interaction decisions awaiting review

The public-header owner entry is already decided: it remains visually secondary and changes from `Sign in` to `Admin` when an owner session is present.

The maintainer must approve these before final UI work:

1. The user-facing component noun and all Chinese status labels.
2. A service-monitor, personal-editorial, or mixed visual direction.
3. Typography, palette, density, icon style, radius, shadow, whether dark mode is in scope, and its behavior if included.
4. Rows, tables, or cards for public components.
5. Whether the current state becomes a large hero or a compact status header.
6. Whether mobile receives a persistent quick-update control.
7. Whether empty incident and maintenance sections remain visible.
8. Animation presence, purpose, and intensity.
9. Recent-record count and summary length.
10. Whether any 30/90-day visualization belongs in the first release; the current recommendation is no.
