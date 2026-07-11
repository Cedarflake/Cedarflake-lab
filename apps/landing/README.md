# Cedarflake Lab Landing

The landing app is a configuration-driven index for the projects in this monorepo. Project data, site copy, derived data, and presentation are deliberately separated so that routine catalog updates do not require component changes.

## Architecture

```text
src/
├── config/
│   ├── projects.ts    # Single project manifest
│   ├── site.ts        # Navigation, copy, repository metadata
│   └── workbench.ts   # Workbench category definitions
├── lib/
│   └── projectCatalog.ts # Filtering, grouping, sorting, counts, source links
├── scripts/
│   ├── validate.ts        # Validation entrypoint
│   ├── validateCatalog.ts # Local path, cover, dimension, and asset-copy checks
│   ├── validateSiteConfig.ts # Copy, collections, IDs, and repository metadata
│   ├── validateDocument.ts # Language, metadata, resource links, and app mount point
│   └── validateMarkup.ts  # Static IDs, anchors, ARIA, images, and external links
├── styles/
│   ├── foundation/       # Tokens, reset, typography, accessibility, motion policy
│   ├── layout/           # Site shell and reusable page-section geometry
│   ├── components/       # Buttons, carousels, cards, headings, workbench
│   └── pages/            # Home-page composition and page-only sections
├── types/
│   └── project.ts     # Discriminated project entry types
└── components/        # Presentation only
```

`projectCatalog` is the source of truth. The page derives section lists, the latest-project carousel, workbench groups, repository links, and header counts from it. Duplicate IDs and paths or invalid update dates fail with a clear error.

Every rendered project collection is ordered by `updatedAt` from newest to oldest, with the title as a deterministic tie-breaker. Workbench categories retain the order declared in `src/config/workbench.ts`, while the projects inside each category follow the shared update order.

`pnpm validate` executes the catalog and site-configuration invariants before checking repository paths, public covers, declared PNG dimensions, canonical asset copies, the static document shell, and the server-rendered markup relationships. It runs automatically as part of this app's existing `check` and `build` commands; no separate CI workflow is required.

`src/styles.css` is an import-only entrypoint, ordered from low-level foundations to page-specific composition. Keep rules in the layer that owns them:

- `foundation/` must not own feature layout. It contains shared values, element defaults, accessibility helpers, and reduced-motion policy.
- `layout/` owns reusable page geometry such as the site shell and section spacing, not component appearance.
- `components/` owns each reusable UI surface together with its responsive rules. Shared card structure belongs in `components/card-shared.css`.
- `pages/` composes components for this landing page. It may position a component contextually, but must not redefine that component's base contract.

Add new imports to the matching block in `src/styles.css`; do not create cross-layer imports or return to a flat `styles/` directory.

Repository-wide brand assets remain in the root `assets/` directory. The landing app keeps deployment copies in `public/` so a Vercel project rooted at `apps/landing` is self-contained. Refresh those copies when the canonical assets change.

## Add a project

Add one entry to [`src/config/projects.ts`](./src/config/projects.ts) and choose its primary `presentation`:

- `featured` places a visual project in the main project section.
- `catalog` creates a compact card in `building` or `others`.
- `workbench` places the project in a configured workbench category.

Every entry needs a unique `id`, repository-relative `path`, `title`, `summary`, `kind`, and ISO `updatedAt`. Paths use portable forward slashes without empty, `.` or `..` segments; URL-sensitive characters inside a segment are encoded automatically. By default, the card links to that path on GitHub. Add `externalUrl` when the preferred destination is a deployed site.

Add a `showcase` object when the project should appear in the latest-project carousel. A showcase needs a label, tags, and a real cover image with alt text and intrinsic dimensions. Any primary presentation can opt in, and the carousel includes every opted-in project without a fixed card limit. It sorts them by `updatedAt` newest first, with the title as a deterministic tie-breaker.

Put deployment-ready covers in `public/covers/`. Prefer a representative project image or a 16:9 page snapshot; update the cover and `updatedAt` together when the visible project changes materially.

No component or count changes are needed for a new project. TypeScript reports missing or incompatible fields for the selected presentation.

## Add a workbench category

Add the category once in [`src/config/workbench.ts`](./src/config/workbench.ts), then use its `key` on workbench project entries. The category type and rendered groups are derived automatically. Empty category text, duplicate keys or IDs, and project references to unknown categories fail validation.

## Change site copy

Edit [`src/config/site.ts`](./src/config/site.ts) for the locale, time zone, navigation, headings, hero copy, repository commands, and footer text. Project content should remain in the project manifest. The document language, project-date formatter, and deterministic title sorting all consume the shared locale configuration.

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
