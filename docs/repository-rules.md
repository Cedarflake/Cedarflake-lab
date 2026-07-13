# Repository Rules

This document is the canonical cross-project maintenance policy for Cedarflake Lab. It defines how a repository change propagates through the project catalog, documentation, Live links, workspace metadata, licenses, and CI.

Project-local instructions remain authoritative for implementation details. The closest `AGENTS.md`, project configuration, scripts, and project README may impose additional requirements.

## 1. Rule Precedence

Use this order when instructions overlap:

1. The explicit task and maintainer direction.
2. The closest `AGENTS.md` in the target path.
3. Project-owned configuration, scripts, README, and established code style. Configuration and scripts win when a documented command or version conflicts.
4. This cross-project policy.

Configuration files are the source of truth for current versions and executable commands. When documentation about the changed behavior conflicts with configuration or scripts, select the owner by the precedence above, run its executable check, and update the conflicting documentation in the same diff. If the explicit task does not determine the intended behavior and no authoritative source resolves the conflict, stop only that disputed change and report the evidence. Mention unrelated drift only in the final handoff; do not edit unrelated files or create issues or other external records without authorization.

The terms in this document are normative:

- **Must** marks a mandatory requirement. A deviation requires an explicit maintainer instruction or a closer project rule.
- **Should** marks the default choice. A deviation requires a conflicting formatter, linter, framework convention, project rule, or dominant local style.
- **May** marks an optional action with no compliance requirement.

## 2. Frontend Engineering Defaults

These defaults apply to new or modified JavaScript, TypeScript, React, Vue, CSS, and related frontend configuration. They do not authorize mass formatting or cleanup of unchanged legacy code.

The closest formatter, linter, framework convention, compiler configuration, local `AGENTS.md`, and established project style take precedence. A style is dominant when more than half of the directly comparable sibling files use it. If there is no dominant sibling style and no machine-readable rule, use the defaults below. Python remains governed by Ruff, project configuration, and the Workbench rules.

### 2.1 Files and Naming

- Name new React and Vue component files in `PascalCase` when the owning project has no different dominant convention.
- Framework-reserved entries such as `page.tsx`, `layout.tsx`, `route.ts`, `loading.tsx`, `index.tsx`, and dynamic-route directories keep their framework-defined names.
- Name new non-component `.ts` and `.js` files with the dominant `camelCase` or `kebab-case` convention among sibling files. If neither convention dominates, use `camelCase`.
- Name new frontend directories in `kebab-case` unless a framework or generator requires another shape.
- Use `camelCase` for variables and functions, and `PascalCase` for types, interfaces, classes, and component symbols.
- Use `SCREAMING_SNAKE_CASE` for environment-variable names. Preserve exact names from external APIs, schemas, protocols, and serialized data.
- New local boolean variables that express a predicate should start with `is`, `has`, `can`, or `should`. Exact external field names and established domain terms are exempt.
- Follow the owning style system for CSS names. Without a project convention, use `kebab-case` for global classes; preserve established BEM, CSS Modules, or utility-class conventions.

### 2.2 Formatting and Imports

- The nearest formatter or linter controls indentation, quotes, semicolons, trailing commas, and line width.
- Without such configuration, use 2-space indentation, double quotes, no semicolons, trailing commas wherever the syntax permits, and K&R braces with the opening brace on the same line.
- Keep text files UTF-8 with LF endings, no trailing whitespace, and a final newline unless a closer `.editorconfig` overrides a file type.
- Group ECMAScript imports in this order: Node built-ins, third-party dependencies, alias paths, relative paths, then CSS or other style files.
- Separate each non-empty import group with exactly one blank line. Do not create blank lines for absent groups.
- Place `import type` declarations in the group determined by their module source. Use the `node:` prefix for new Node built-in imports when the project has no contrary convention.
- Run the owning formatter on changed files or the changed project. Do not format unrelated projects or unchanged legacy files.

### 2.3 TypeScript

- Do not add explicit `any`. Use `unknown` plus narrowing, a generic, or a precise type.
- Do not use `@ts-ignore`. Use `@ts-expect-error` only when the expected compiler error is intentional and an adjacent comment states the reason.
- Prefer a guard or type refinement over a non-null assertion. A non-null assertion is allowed only when every control-flow path initializes or checks the value in the same scope, or an adjacent comment identifies the framework or API invariant that guarantees it.
- Follow the project's established object-type convention. When no convention dominates, use `interface` for object shapes and `type` for unions, intersections, primitive aliases, mapped types, and tuple aliases.
- New TypeScript projects must extend a strict shared configuration or set `strict: true`. Do not disable or weaken strictness to make a check pass.
- Project configuration owns the TypeScript version, module resolution, and optional strict flags. Do not assume every workspace inherits `tsconfig.base.json`.

### 2.4 Source Comments and Encoding

- Add source comments only for design intent, non-obvious logic, special constraints, public contracts, or implementation reasons.
- Do not add comments that merely restate the syntax or visible behavior of the next line.
- Write source comments for maintainers. User-facing explanation belongs in UI copy or documentation.
- Source comments must not mention AI identity, prompts, conversations, model behavior, or generation history.
- These comment restrictions apply to source comments, not to intentional project documentation or historical analysis.

### 2.5 Component Organization

- Organize new components in the order behavior, structure, then presentation unless the owning framework or project defines another order.
- Vue single-file components default to `<script setup lang="ts">`, then `<template>`, then `<style scoped>`.
- In React components, place state, derived data, event handlers, and effects before the return statement. Keep the primary JSX structure in the return.
- Put component-owned styles after the component when using an in-file styling system, or in the owning stylesheet or CSS Module. Follow existing Tailwind, CSS Modules, and framework placement conventions.

## 3. Before Making a Change

1. Confirm the repository root and inspect `git status`.
2. Read the target README, manifest, nearest `AGENTS.md`, and owning CI workflow.
3. Identify the owning layer. The owner is shared when the behavior is used by two or more projects, changes a package public API, or is defined by root configuration; otherwise the owner is the single affected project.
4. Search for the current path, package name, public URL, and generated artifact before renaming or moving anything.
5. Preserve unrelated worktree changes and keep the change limited to the requested concern.

## 4. Repository Taxonomy

| Root                          | Intended contents                                                       | Required depth                |
| ----------------------------- | ----------------------------------------------------------------------- | ----------------------------- |
| `apps/<slug>`                 | Runnable applications, deployed sites, and product-style demos          | One project below `apps/`     |
| `packages/<slug>`             | Reusable frontend packages                                              | One project below `packages/` |
| `workbench/<category>/<slug>` | Local Python utilities and small projects                               | Category, then project        |
| `others/<category>/<slug>`    | Userscripts, interface studies, retired experiments, and other material | Category, then project        |

Do not add a new top-level collection or change these depths without updating the repository contract checker, landing discovery validator, root documentation, and every workflow whose path filters, commands, or working directories read that collection. Review workspace globs and update them only when workspace membership changes. `apps/landing` is the only project intentionally excluded from landing catalog coverage because it is the catalog itself.

## 5. Documentation and Metadata Ownership

| Surface                                                   | Owns                                                                                                      |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Root `README.md`                                          | High-level repository entry, app inventory, and public app Live endpoints                                 |
| Collection README                                         | Complete inventory and collection-specific policy for `packages/`, `workbench/`, or `others/`             |
| Category README                                           | Category inventory when a category has one, such as `others/userscripts/README.md`                        |
| Project README                                            | Purpose, setup, usage, status, limitations, license, and project Live URL                                 |
| Landing project config                                    | Public catalog identity, summary, lifecycle, update time, source link, external destination, and showcase |
| `package.json`, `pyproject.toml`, requirements, lockfiles | Machine-readable package identity, scripts, dependencies, engines, and license metadata                   |
| `docs/`                                                   | Cross-project policy and architecture that does not belong to one project                                 |
| `scripts/repository-contract/`                            | Machine-enforceable tracked-file invariants, diagnostics, and checker fixtures                            |
| `.github/workflows/`                                      | Automated trigger scope and executable validation                                                         |

Do not copy an entire policy into several READMEs. Link to the canonical owner, but update every surface that independently presents the changed fact. A public URL, for example, appears independently in the root index, project README, and landing catalog.

This document remains the canonical policy. The repository contract checker implements only its machine-verifiable subset, the root `package.json` exposes that checker as `pnpm check:repository-contract`, and GitHub Actions owns when the command runs. When an encoded rule changes, update the policy, checker diagnostics, and relevant fixtures together.

## 6. Minimum Project Contract

Every new project must provide:

- A `README.md` describing its purpose, current status, setup or installation, validation commands, license status, and every browser, system binary, service, or environment prerequisite required by those commands.
- A landing catalog entry unless it is `apps/landing`.
- An entry in the root or collection/category index that owns its inventory.
- An explicit license decision. `apps/`, `packages/`, and `others/` do not inherit a repository-wide license. `workbench/LICENSE` is the default only for workbench projects without a local license.
- No committed secrets, personal configuration, runtime data, downloads, caches, or virtual environments.

Node projects included in the pnpm workspace must also provide:

- A `package.json` whose `name` is unique in the workspace and whose SPDX `license` matches its local license terms. Inherit the root Node policy, or declare an `engines.node` range that includes the CI Node 22 line when the project installs or deploys independently.
- Non-no-op `check` and `build` scripts. `check` must fail on the project's required static or behavioral validation; `build` must produce or validate its deployable, publishable, or installable output.
- Dependency changes made through pnpm with the root lockfile updated.

Python workbench projects must document whether they use a local `pyproject.toml`, `uv.lock`, `requirements.txt`, or dependency-free execution.

Imported projects must preserve upstream attribution and licensing. Never infer or manufacture a license for third-party code or assets; record an explicit unlicensed or review-needed status when reuse terms are not known.

`pnpm check:repository-contract` validates only invariants that can be proven from tracked repository files. Passing it does not verify external URL availability, deployment-provider settings, runtime behavior, undocumented local prerequisites, or the legal validity of a license decision. Complete the manual and project-specific checks required elsewhere in this document even when the repository contract passes.

## 7. Adding a Project

### 7.1 Application

For `apps/<slug>`:

1. Add the app to the root `README.md` Workspaces table.
2. Add a landing entry in `featured.ts` or `building.ts`. A building entry must start with `lifecycle: "active"`; a featured entry must not declare `lifecycle`.
3. Add `package.json`, a project README, and either a local `LICENSE` or an explicit README statement that no reuse license is granted.
4. If the app manifest has a `dev` script, add a root `dev:<slug>` command that filters to that one package. Do not add the root command when the app has no development server.
5. If deployed, synchronize the verified Live URL as described below.
6. Confirm that Apps & Packages CI provides the required baseline. Add a dedicated project workflow when validation requires a browser binary, OS package or service, secret, schedule, platform matrix, artifact upload, or setup that the group workflow does not provide.

### 7.2 Reusable Package

For `packages/<slug>`:

1. Update `packages/README.md`.
2. Add the package to the landing catalog.
3. Provide a project README, local license, and package manifest.
4. For a publishable package, make `repository.directory` match the real repository path, make `homepage` and `bugs` resolve to their documented destinations, and verify every `files` and export path exists after build.
5. When the public API changes, validate the package and every repository workspace whose manifest depends on it and whose source calls the changed API. If no such workspace exists, add or update a fixture or demo that imports the built public export instead of a source-only alias.

### 7.3 Python Workbench Project

For `workbench/<category>/<slug>`:

1. Update `workbench/README.md`.
2. Add the project to `apps/landing/src/config/projects/workbench.ts`.
3. Add a landing category definition first if the category is new; the path's second segment must match its category key.
4. Use uv for environments and commands.
5. Add the project's test command to Workbench Python CI when the project contains `tests/`, `test_*.py`, or a README-declared test command.
6. Add the project to the audit matrix when `pyproject.toml`, `requirements.txt`, or `uv.lock` declares third-party runtime dependencies. A dependency-free project is excluded.
7. Use `workbench/LICENSE` unless a project-local license takes precedence.

Ruff automatically scans the workbench tree, but tests and dependency audits are explicit workflow lists and do not discover new projects automatically.

### 7.4 Other Project or Userscript

For `others/<category>/<slug>`:

1. Update `others/README.md`.
2. Update `others/<category>/README.md` when that file exists.
3. Add the project to `apps/landing/src/config/projects/others.ts` with an explicit lifecycle.
4. Add a local README and explicit license status.
5. Add a Node project to `pnpm-workspace.yaml` when it depends on a workspace package or must participate in root install, check, or build. Otherwise mark it as standalone in its README.

New userscripts must also document installation, userscript-manager compatibility, and the committed-artifact policy. If an install URL points to generated `dist/` output, generate it through the project build and provide a drift check. A userscript that runs a real-browser test needs a dedicated workflow unless at least two userscripts execute the same version-controlled browser harness and can share one category-level path filter.

After adding any project described in this section, run `pnpm check:repository-contract` in addition to its category- and project-specific validation.

## 8. Landing Catalog Rules

The landing validator discovers:

- `apps/*`
- `packages/*`
- `workbench/*/*`
- `others/*/*`

Every discovered project except `apps/landing` needs exactly one catalog entry. Choose the module by presentation:

- `featured.ts` for visual projects promoted in the main section.
- `building.ts` for compact app and package cards.
- `workbench.ts` for workbench categories and projects.
- `others.ts` for other projects and lifecycle state.

Repository infrastructure outside the discovered roots, including `scripts/repository-contract/` and `.github/workflows/`, is not a project. A checker- or CI-only change does not add a catalog entry, alter Landing presentation metadata, or bump `updatedAt`.

Every entry needs a unique repository-relative `path`, `title`, `summary`, `kind`, and time-zone-qualified ISO `updatedAt`. Keep the path taxonomy aligned with the kind. Building and others entries must also define `label` and `lifecycle: "active" | "archived"`; featured and workbench entries do not support `lifecycle`. Adding one project inside the existing taxonomy does not require editing card numbers, aggregate counts, or `projects.ts`.

Use `externalUrl` only when the same credential-free HTTPS URL is identified as the canonical Live destination in the root or project README, or the explicit task names it as the card destination. Without it, the card intentionally links to the GitHub source path.

Use `showcase` only when a unique PNG of the project's actual UI or output is available:

- Store a unique PNG showing the project's actual UI or output in `apps/landing/public/covers/`.
- Write alt text that describes visible content instead of repeating only the project title, and declare dimensions that match the PNG.
- Update the cover when the current image no longer matches the project's visible UI, branding, layout, or primary output.
- Remove the cover when the showcase is removed; orphaned and reused covers fail validation.

`updatedAt` changes only for a user-visible feature, UI or content change, public API change, installation or usage change, lifecycle transition, canonical deployment, correctness fix, or security fix. A first usable public release is a material change. Do not bump it for formatting, spelling, path correction, pure metadata cleanup, CI-only work, or a hostname typo. A lifecycle transition must also update the project README and owning index.

Landing SEO configuration describes the Cedarflake Lab landing site only. Every deployable app owns its own title, description, favicon, canonical URL, social metadata, and robots policy.

## 9. README and Live URL Rules

A deployment is stable only when a credential-free HTTPS GET reaches the intended app after redirects, does not use a preview or expiring hostname, requires no login, and is intended as the canonical endpoint.

For an app with a stable public deployment, keep the same canonical endpoint in:

1. The root README Live column.
2. The project README.
3. Project-owned canonical and social metadata for a web app.
4. Package `homepage` or userscript metadata only when the existing field or project documentation defines that field as the deployment destination.

For a deployed app with a catalog entry, add `externalUrl` when the root or project README identifies that deployment as canonical, or the explicit task selects it as the card destination. `apps/landing` is the catalog itself and has no catalog entry.

The repository contract checker and its workflow are not applications, workspace inventory entries, or deployments. Checker- or CI-only changes do not add a root README Workspaces row, a project or collection README entry, or a Live URL. Document the targeted checker command in Section 14; root `pnpm check` remains the aggregate command exposed by the root README.

Before recording an endpoint:

- Verify the final credential-free HTTPS URL returns the intended app.
- Do not publish localhost, preview, expiring, private, or authentication-only URLs as Live.
- Use `—` in the root table when no stable public endpoint exists.
- For Vercel projects, verify the external Dashboard Root Directory as well as checked-in `vercel.json` or local workspace configuration.

When a domain changes, update every owning surface in the same change and search for the old URL. Removing a deployment requires removing or replacing stale public links; changing repository metadata alone does not disable the external deployment.

## 10. Workspace, Dependencies, and Generated Files

The pnpm workspace currently includes `apps/*`, `packages/*`, and `others/userscripts/*`.

- Use the repository-declared pnpm version and run installs from the root.
- After adding or moving a Node project, run pnpm install so `pnpm-lock.yaml` receives the correct importer path.
- Do not hand-edit or copy lockfile importers.
- Keep Node engines and build-script allowlists within root policy; the compatibility checks below must pass.
- Use uv for Python work and update `uv.lock` or requirements through the owning tool.

Do not edit build output such as `dist/`, `.next/`, coverage, artifacts, or caches. A generated artifact may be committed only when a README, userscript metadata block, package `files` or `exports`, or release process directly publishes or installs that file. In that case:

1. Source remains authoritative.
2. The owning build script generates the artifact deterministically.
3. A check verifies that the committed output is current.
4. Path-specific ignore exceptions unignore only the published generated directory and files.

Node and build-policy compatibility requires `pnpm install --frozen-lockfile` to pass under the repository's strict Node policy. A native dependency must not appear in both `allowBuilds` and `ignoredBuiltDependencies`.

## 11. GitHub Actions Rules

Workflow filenames use:

```text
<scope>-<target>-<purpose>.yml
```

Allowed scopes:

- `repo`: repository-wide policy or security.
- `group`: one coherent collection of projects.
- `project`: one independently validated project.

Common purposes are `ci`, `security`, `release`, and `maintenance`. Targets use kebab-case. Display names begin with the matching `[Repo]`, `[Group]`, or `[Project]` prefix.

Every remote Action and reusable workflow reference must use the full 40-character lowercase commit SHA from a verified upstream release, followed by the exact release tag in an inline comment. Local `./` references are exempt; Docker actions must use a lowercase SHA-256 image digest. Dependabot owns routine GitHub Actions updates and must preserve immutable references and readable release comments.

Set `persist-credentials: false` on every `actions/checkout` step unless that job is explicitly responsible for committing or pushing. A credential-writing job must document that responsibility in its workflow, retain the smallest required token permissions, and must not run untrusted pull-request code with write credentials.

Current workflow ownership:

| File                                 | Responsibility                                                    |
| ------------------------------------ | ----------------------------------------------------------------- |
| `repo-codeql-security.yml`           | Repository JavaScript/TypeScript CodeQL analysis                  |
| `repo-repository-contract-ci.yml`    | Repository structure, metadata, and synchronization contract      |
| `group-apps-packages-ci.yml`         | Baseline dependency audit, check, and build for apps and packages |
| `group-workbench-python-ci.yml`      | Workbench Ruff, registered tests, and dependency audits           |
| `project-liminal-drift-ci.yml`       | Liminal Drift project and browser validation                      |
| `project-youtube-auto-resume-ci.yml` | YouTube userscript unit, build-drift, and browser validation      |

`repo-repository-contract-ci.yml` uses the display name `[Repo] Repository Contract CI`. It runs for every pull request and every push to `main`, without path filters, because a change at any tracked path can introduce a contract violation; it also supports `workflow_dispatch`. Keep this repository-wide gate separate from group and project workflows.

Workflow ownership consists of the project directories and shared files that its project-specific commands explicitly type-check, test, build, audit, or upload. Repository-root checkout and frozen-install setup do not transfer ownership of unrelated sibling workspaces to a project workflow when a broader group workflow validates that shared install boundary.

For workflows that use path-filtered `pull_request` or `push` triggers:

- Match `pull_request.paths` and `push.paths` to the workflow's real ownership.
- Include the workflow's own path in both trigger lists.
- Include a shared root file when changing it can alter that job's install, type-check, test, build, audit, or upload result and no broader unconditional workflow covers the same owner.
- Do not add the global lockfile to every project workflow by default. A lockfile-only change affects a project when its importer or a resolved dependency reachable from that importer changes. If the task authorizes publishing the ref, run that project's `workflow_dispatch` after push or expand the trigger in the same change. Without push or dispatch authorization, run the equivalent local check and report that remote validation remains pending.
- Do not add browser binaries, OS packages or services, secrets, platform matrices, or project-only artifact uploads to an unrelated group workflow.
- When moving a project, update filters, working directories, package filters, artifact paths, and self-paths together.
- Before renaming a workflow, inspect repository rulesets, required checks or workflows, branch protection, badges, and external integrations. Preserve job IDs unless their consumers are also migrated.

Run `pnpm check:workflows` after editing workflow YAML; a zero exit code is the repository's YAML parse and formatting gate. Also inspect path filters, working directories, package filters, permissions, and self-paths because formatting cannot validate GitHub-specific ownership.

A path-filtered project workflow must not be the only unconditional repository-wide required check: it can be skipped legitimately for unrelated changes. If branch protection is introduced, use path-aware rules or an aggregate workflow that produces the same required job name on every applicable pull request.

## 12. Moving or Renaming a Project

Use a history-preserving move, then search for the old path, package name, and URL. For every item below, update every search match that owns the changed identifier; an item is not applicable only when the repository search returns no match:

- Landing `path`, presentation, category, and cover.
- Root, collection, category, and project READMEs.
- Cross-project files under `docs/`.
- Package `name`, `repository.directory`, `homepage`, and root `dev:*` filters.
- Workspace globs and the lockfile importer.
- CI triggers, working directories, package filters, and artifact paths.
- Deployment Root Directory and project-owned SEO.
- Root Live link, project Live link, and landing `externalUrl`.
- Userscript `@homepageURL`, `@downloadURL`, and `@updateURL`, generated-artifact paths, and path-specific `.gitignore` exceptions, followed by a rebuild of committed output.
- License, attribution, and upstream-source references.

Finish by searching the repository for the old identifiers. Do not assume a successful build proves that documentation or external deployment configuration was updated.

## 13. Archiving or Deleting a Project

Archiving retains source and history:

- Keep the project in the landing catalog because coverage validation still discovers its directory.
- Move an archived featured app or package to a catalog presentation that supports `lifecycle: "archived"`.
- Remove an obsolete showcase and its cover.
- Remove or replace a dead `externalUrl`.
- Mark the status near the top of the project README and in its owning index.
- Preserve licenses, attribution, and historical context.
- Apply the CI disposition criteria below.
- Disable the external deployment separately.

The current landing model cannot directly mark featured or workbench entries as archived. Convert a featured project to a catalog card. For a workbench project, extend the type and UI model before archiving; deleting its entry alone is invalid.

Keep project-specific CI automatic while the archived project remains publicly deployed or distributed, or while security maintenance is promised. Change it to `workflow_dispatch`-only when the goal is source reproducibility without ongoing delivery. Remove the dedicated workflow only when neither obligation exists and the project has no project-specific validation; group baseline checks still apply while the project remains under an included app or package path.

Deleting source also requires deleting its catalog entry, cover, index rows, workspace and lockfile state, dedicated workflow, deployment, and path-specific documentation. Check for orphaned assets and old URLs.

## 14. Validation Routes

Run the smallest owning checks first:

| Area                                             | Minimum validation                                                                                                                                                                                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary app or package                          | Always run `pnpm --filter <package-name> check`. Also run `build` after changes to source, public assets, build configuration, dependency manifests or importer resolutions, generator inputs, or other files consumed by the build.                                   |
| Landing catalog, metadata, components, or styles | Run `pnpm --filter @cedarflake/landing check` and `pnpm --filter @cedarflake/landing build` for every production-visible catalog, component, style, document, SEO, asset, or deployment change.                                                                        |
| Focus Orb package/demo                           | Run both workspace `check` scripts and `pnpm check:focus-orb-package`. Build the demo when its source, assets, or build inputs change.                                                                                                                                 |
| Liminal Drift gameplay, rendering, input, or UI  | Run the project `check` plus its documented canvas and interaction browser checks.                                                                                                                                                                                     |
| Userscript with committed output                 | Run the project `check`. Inspect its script definition: run `build:check` and browser tests separately only when `check` does not already include them. Install every documented browser prerequisite first.                                                           |
| Python workbench                                 | Run `uvx ruff format --check workbench`, `uvx ruff check workbench`, and the affected project's README- or CI-declared tests.                                                                                                                                          |
| Repository contract or checker                   | Run `pnpm check:repository-contract` after changing taxonomy, inventories, catalog coverage, workspace registration, workflow ownership, checker source, or fixtures.                                                                                                  |
| Workflow change                                  | Run `pnpm check:workflows` and `pnpm check:repository-contract`, then inspect path filters, package filters, permissions, working directories, immutable Action references, checkout credentials, and self-paths. Review the Actions run only when push is authorized. |

When `repo-repository-contract-ci.yml` changes, run both contract and workflow checks. Run root `pnpm check`, which includes the repository contract, when a change touches two or more project roots, a root configuration consumed by multiple workspaces, or a shared package public API. Run root `pnpm build` when those changes can alter production output in two or more workspaces. These commands intentionally include userscripts; the Apps & Packages workflow remains a narrower CI group.

For moves and URL changes, also run a repository search for every old identifier. Always finish with `git diff --check` and inspect the final diff.

## 15. Git Commit Rules

- Commit or push only when the explicit task requests it.
- Use an English Conventional Commit summary. Count the complete first line; it must contain no more than 20 whitespace-separated words.
- Keep the summary specific to the committed diff.
- When a body is needed, leave one blank line after the summary and use concise `- ` bullet items without blank lines between bullets.

```text
fix(sitemap): disable filter when allowPaths is empty

- Skip sitemap filtering when allowPaths is not provided
- Add a warning for invalid configuration
```

## 16. Completion Checklist

Before considering any repository change complete, confirm:

- [ ] The project is in the correct taxonomy and directory depth.
- [ ] Project README and license status are explicit.
- [ ] Root and collection/category indexes are synchronized.
- [ ] Landing path, presentation, date, external URL, and cover are correct; `lifecycle` is present only for building and others catalog entries.
- [ ] Public Live URLs were verified and synchronized.
- [ ] Workspace metadata, lockfiles, and generated artifacts are current.
- [ ] Every documented browser, binary, service, and environment prerequisite is reproducible on a new machine.
- [ ] CI naming, trigger scope, commands, and manual test/audit lists are current.
- [ ] Repository contract policy, checker scope, diagnostics, and fixtures agree; `pnpm check:repository-contract` passed when an owned invariant changed.
- [ ] Old paths, names, URLs, and orphaned assets are absent.
- [ ] New or modified frontend code follows the owning project rules or the Section 2 defaults.
- [ ] Targeted validation passed; root checks ran when the Section 14 ownership-boundary conditions were met.
- [ ] The final diff contains no unrelated edits.
