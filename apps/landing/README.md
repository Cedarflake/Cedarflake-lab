# Cedarflake Lab Landing

The landing app is a configuration-driven index for the projects in this monorepo. Project data, site copy, derived data, and presentation are deliberately separated so that routine catalog updates do not require component changes.

Live site: [https://test.i0c.cc/](https://test.i0c.cc/)

## Architecture

```text
.
├── scripts/
│   ├── validate.ts            # Validation entrypoint
│   ├── validateCatalog.ts     # Taxonomy, paths, covers, and asset-copy checks
│   ├── validateSiteConfig.ts  # Copy, IDs, locale, and repository metadata
│   ├── validateCollections.ts # Rendered membership, ordering, groups, and stats
│   ├── validateStyles.ts      # Import coverage, layers, and stylesheet ownership
│   ├── validateDeployment.ts  # Vercel schema, Corepack, and direct pnpm install
│   ├── validateDocument.ts    # Metadata, structured data, crawl assets, and document shell
│   ├── validateMarkup.ts      # Static IDs, links, ARIA, images, and headings
│   └── validateBuild.ts       # Pre-rendered HTML, canonical metadata, robots, and sitemap
└── src/
    ├── components/            # Presentation only
    ├── config/
    │   ├── projects.ts        # Project-module aggregation
    │   ├── projects/
    │   │   ├── building.ts    # Building-block catalog entries
    │   │   ├── featured.ts    # Featured showcase entries
    │   │   ├── others.ts      # Other entries and lifecycle state
    │   │   └── workbench.ts   # Workbench categories and entries
    │   ├── seo.ts             # Canonical identity, search metadata, and social preview
    │   └── site.ts            # Navigation, copy, repository metadata
    ├── lib/
    │   ├── projectCatalog.ts  # Validation, grouping, sorting, counts, source links
    │   └── seo.ts             # Metadata templates, JSON-LD, robots, and sitemap generation
    ├── styles/
    │   ├── foundation/        # Tokens, reset, typography, accessibility, motion, style readiness
    │   ├── layout/            # Site shell and reusable page-section geometry
    │   ├── components/        # Buttons, carousels, cards, headings, workbench
    │   └── pages/             # Home-page composition and page-only sections
    └── types/
        └── project.ts         # Discriminated project entry types
```

`projectCatalog` is the source of truth. The page derives section lists, the latest-project carousel, workbench groups, repository links, and header counts from it. Validation scans the established `apps`, `packages`, `workbench`, and `others` taxonomy so a new project directory cannot be omitted accidentally; only the landing index itself is excluded. Duplicate paths or visible titles and invalid update dates fail with a clear error.

Every rendered project collection is ordered by `updatedAt` from newest to oldest, with the title as a deterministic tie-breaker. Catalog card numbers are generated from that final order, so adding or updating a project never requires renumbering the manifest. Workbench categories retain the order declared in `src/config/projects/workbench.ts`, while the projects inside each category follow the shared update order.

`pnpm validate` checks catalog taxonomy, repository paths, public covers, declared PNG dimensions, canonical asset copies, site and SEO configuration, derived collection membership and ordering, stylesheet ownership, Vercel deployment configuration, the static document shell, structured data, crawl assets, and server-rendered markup relationships. It runs automatically before `dev` and as part of this app's existing `check` and `build` commands; no separate CI workflow is required. The build then runs `validateBuild.ts` against `dist/` so an empty app shell, unresolved SEO token, or stale robots and sitemap output cannot ship.

The Vite document plugin pre-renders the React page into `index.html` and the client hydrates that markup instead of replacing an empty root. Search crawlers and link unfurlers therefore receive the page title, project copy, links, canonical metadata, and JSON-LD in the initial response without waiting for JavaScript. A minimal inline guard keeps the root hidden until the imported readiness stylesheet applies, preventing pre-rendered content from flashing without its styles in development and production without tying visibility to hydration or a timer.

`src/styles.css` is an import-only entrypoint, ordered from low-level foundations to page-specific composition. Keep rules in the layer that owns them:

- `foundation/` must not own feature layout. It contains shared values, element defaults, accessibility helpers, and reduced-motion policy.
- `layout/` owns reusable page geometry such as the site shell and section spacing, not component appearance.
- `components/` owns each reusable UI surface together with its responsive rules. Shared card structure belongs in `components/card-shared.css`.
- `pages/` composes components for this landing page. It may position a component contextually, but must not redefine that component's base contract.

Add new imports to the matching block in `src/styles.css`; do not create cross-layer imports or return to a flat `styles/` directory.

Validation keeps `src/styles.css` import-only, requires every stylesheet to be imported exactly once, enforces the documented layer order and kebab-case filenames, and rejects nested imports. A misplaced or orphaned style file therefore fails locally instead of silently disappearing from the page.

Viewport entrance motion is opt-in through `data-reveal`. `useEntranceReveal` waits for the stylesheet readiness signal and one painted frame before observing each target, then disconnects on unmount; this preserves the initial motion state even with fast hydration or cached assets. The shared motion stylesheet owns timing and stagger values. Keep reveal effects limited to opacity and transforms so they do not shift carousel geometry. Reduced-motion users and browsers without `IntersectionObserver` receive the final visible state after styles are ready.

Showcase covers expose an explicit loading state: successful images fade from a soft loading treatment, while failed images become visible immediately so alternative text is not hidden. Keep intrinsic dimensions on every cover to prevent the transition from introducing layout shift.

Repository-wide brand assets remain in the root `assets/` directory. The landing app keeps deployment copies in `public/` so a Vercel project rooted at `apps/landing` is self-contained. Refresh those copies when the canonical assets change. The Hero uses a landing-owned transparent variant so its entrance animation never depends on background blending. Validation checks the configured artwork dimensions and real pixel transparency, verifies canonical-copy byte identity, and requires the favicon source to remain square.

## Add a project

Add one entry to the configuration module that owns its primary `presentation`:

- [`featured.ts`](./src/config/projects/featured.ts) owns visual projects in the main project section.
- [`building.ts`](./src/config/projects/building.ts) owns compact building-block cards.
- [`workbench.ts`](./src/config/projects/workbench.ts) owns workbench categories and their projects.
- [`others.ts`](./src/config/projects/others.ts) owns the remaining compact cards.

[`src/config/projects.ts`](./src/config/projects.ts) only aggregates those modules, so routine project additions do not require editing it.

Every entry needs a unique repository-relative `path`, `title`, `summary`, `kind`, and ISO `updatedAt`. The path is the stable project identity and React key; visible card numbers are derived automatically after sorting. Catalog entries also declare a visible format `label` and an explicit `lifecycle` of `active` or `archived`; archived styling and the `Archived` badge are both derived from that lifecycle instead of separate presentation flags. Text values must not contain surrounding whitespace. Paths use portable forward slashes without empty, `.` or `..` segments; URL-sensitive characters inside a segment are encoded automatically.

Every project card retains a `Source` action whose GitHub URL is derived from `path`. An optional `externalAction` adds exactly one credential-free HTTPS action after `Source`: use `kind: "live"` only for a verified canonical deployment synchronized with the root and project READMEs and project-owned web metadata; use `kind: "install"` only for an externally verified distribution synchronized with the project README and its owning registry or generated userscript metadata. An Install destination must identify the real installation channel rather than a source or documentation page. Workbench entries remain source-only under the current local-first presentation.

Keep the path taxonomy consistent with the entry: `app` uses `apps/`, `package` uses `packages/`, `workbench` uses `workbench/`, and `other` uses `others/`. The primary section must match that root, and a workbench project's category must match the second path segment. Validation rejects mismatches before they can produce incorrect groups or counts.

Add a `showcase` object when the project should appear in the latest-project carousel. A showcase needs a label, tags, and a real cover image with alt text and intrinsic dimensions. Any primary presentation can opt in, and the carousel includes every opted-in project without a fixed card limit. It sorts them by `updatedAt` newest first, with the title as a deterministic tie-breaker.

Put deployment-ready PNG covers in `public/covers/`. Prefer a representative project image or a 16:9 page snapshot; each showcase owns a unique cover source. Update the cover and `updatedAt` together when the visible project changes materially. Remove obsolete cover files when their project reference is removed because reused and unreferenced assets fail validation. Other formats require matching intrinsic-dimension validation before they can be added to the cover type.

No component or count changes are needed for a new project. TypeScript reports missing or incompatible fields for the selected presentation.

## Add a workbench category

Add the category once in [`src/config/projects/workbench.ts`](./src/config/projects/workbench.ts), then use its `key` on workbench project entries. The category type and rendered groups are derived automatically. Empty category text, duplicate keys, and project references to unknown categories fail validation.

## Change site copy

Edit [`src/config/site.ts`](./src/config/site.ts) for the locale, time zone, navigation, headings, hero copy and artwork metadata, repository commands, and footer text. Project content should remain in the project manifest. The document language, project-date formatter, and deterministic title sorting all consume the shared locale configuration. Declared hero artwork dimensions are validated against the deployed PNG and drive its layout ratio. Source links require a canonical `https://github.com/<owner>/<repository>` URL and a portable Git branch name because the catalog derives GitHub tree URLs from them.

## Change SEO metadata

Edit [`src/config/seo.ts`](./src/config/seo.ts) for the canonical site URL, document title, description, crawl policy, locale, theme color, repository identity, and social preview. The Vite build derives the canonical, Open Graph, Twitter, JSON-LD, `robots.txt`, and `sitemap.xml` output from this single configuration. Keep the social image in `public/` and update its declared dimensions when replacing it; validation rejects missing, escaping, or mismatched PNG assets.

## Development

From the repository root:

```sh
pnpm install
pnpm dev:landing
pnpm --filter @cedarflake/landing validate
pnpm --filter @cedarflake/landing check
pnpm --filter @cedarflake/landing build
```

For Vercel, set the project Root Directory to `apps/landing` and leave the install command as `pnpm install`.
