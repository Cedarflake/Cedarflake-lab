# Repository Rules

This document is the canonical cross-project maintenance policy for Cedarflake Lab. It defines how a repository change propagates through the project catalog, documentation, Live links, workspace metadata, licenses, and CI.

Project-local instructions remain authoritative for implementation details. The closest `AGENTS.md`, project configuration, scripts, and project README may impose additional requirements.

## 1. Rule Precedence

Use this order when instructions overlap:

1. The explicit task and maintainer direction.
2. The closest `AGENTS.md` in the target path.
3. Project-owned configuration, scripts, README, and established code style. Configuration and scripts win when a documented command or version conflicts.
4. This cross-project policy.

Configuration files are the source of truth for current versions and executable commands. When documentation about the changed behavior disagrees with checked-in configuration, verify the intended behavior and update that documentation in the same change. Mention unrelated drift only in the final handoff; do not edit unrelated files or create issues or other external records without authorization.

## 2. Before Making a Change

1. Confirm the repository root and inspect `git status`.
2. Read the target README, manifest, nearest `AGENTS.md`, and owning CI workflow.
3. Identify the smallest owning layer. Shared behavior belongs in its package or shared configuration, not in a consumer-only override.
4. Search for the current path, package name, public URL, and generated artifact before renaming or moving anything.
5. Preserve unrelated worktree changes and keep the change limited to the requested concern.

## 3. Repository Taxonomy

| Root                          | Intended contents                                                       | Required depth                |
| ----------------------------- | ----------------------------------------------------------------------- | ----------------------------- |
| `apps/<slug>`                 | Runnable applications, deployed sites, and product-style demos          | One project below `apps/`     |
| `packages/<slug>`             | Reusable frontend packages                                              | One project below `packages/` |
| `workbench/<category>/<slug>` | Local Python utilities and small projects                               | Category, then project        |
| `others/<category>/<slug>`    | Userscripts, interface studies, retired experiments, and other material | Category, then project        |

Do not add a new top-level collection or change these depths without updating the landing discovery validator, root documentation, and relevant CI. Review workspace globs and update them only when workspace membership changes. `apps/landing` is the only project intentionally excluded from landing catalog coverage because it is the catalog itself.

## 4. Documentation and Metadata Ownership

| Surface                                                   | Owns                                                                                                      |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Root `README.md`                                          | High-level repository entry, app inventory, and public app Live endpoints                                 |
| Collection README                                         | Complete inventory and collection-specific policy for `packages/`, `workbench/`, or `others/`             |
| Category README                                           | Category inventory when a category has one, such as `others/userscripts/README.md`                        |
| Project README                                            | Purpose, setup, usage, status, limitations, license, and project Live URL                                 |
| Landing project config                                    | Public catalog identity, summary, lifecycle, update time, source link, external destination, and showcase |
| `package.json`, `pyproject.toml`, requirements, lockfiles | Machine-readable package identity, scripts, dependencies, engines, and license metadata                   |
| `docs/`                                                   | Cross-project policy and architecture that does not belong to one project                                 |
| `.github/workflows/`                                      | Automated trigger scope and executable validation                                                         |

Do not copy an entire policy into several READMEs. Link to the canonical owner, but update every surface that independently presents the changed fact. A public URL, for example, appears independently in the root index, project README, and landing catalog.

## 5. Minimum Project Contract

Every new project must provide:

- A `README.md` describing its purpose, current status, setup or installation, validation commands, and license status.
- A landing catalog entry unless it is `apps/landing`.
- An entry in the root or collection/category index that owns its inventory.
- An explicit license decision. `apps/`, `packages/`, and `others/` do not inherit a repository-wide license. `workbench/LICENSE` is the default only for workbench projects without a local license.
- No committed secrets, personal configuration, runtime data, downloads, caches, or virtual environments.

Node projects included in the pnpm workspace must also provide:

- A `package.json` with a stable unique name and accurate license. Inherit the root Node policy, or declare a compatible local `engines.node` range when the project must install or deploy independently.
- Real `check` and `build` scripts when the project is expected to be checked and built. The root commands use `--if-present`, so a missing script would otherwise be skipped silently.
- Dependency changes made through pnpm with the root lockfile updated.

Python workbench projects must document whether they use a local `pyproject.toml`, `uv.lock`, `requirements.txt`, or dependency-free execution.

Imported projects must preserve upstream attribution and licensing. Never infer or manufacture a license for third-party code or assets; record an explicit unlicensed or review-needed status when reuse terms are not known.

## 6. Adding a Project

### 6.1 Application

For `apps/<slug>`:

1. Add the app to the root `README.md` Workspaces table.
2. Add a landing entry in `featured.ts` or `building.ts`.
3. Add `package.json`, project README, and license material.
4. Add a root `dev:<slug>` shortcut only when it is useful enough to maintain.
5. If deployed, synchronize the verified Live URL as described below.
6. Confirm that Apps & Packages CI provides the required baseline. Add a project workflow only for costly or project-specific checks.

### 6.2 Reusable Package

For `packages/<slug>`:

1. Update `packages/README.md`.
2. Add the package to the landing catalog.
3. Provide a project README, local license, and package manifest.
4. For a publishable package, keep `name`, `repository.directory`, `homepage`, `bugs`, `files`, and exports accurate.
5. Validate both the package and at least one real consumer when its public API changes.

### 6.3 Python Workbench Project

For `workbench/<category>/<slug>`:

1. Update `workbench/README.md`.
2. Add the project to `apps/landing/src/config/projects/workbench.ts`.
3. Add a landing category definition first if the category is new; the path's second segment must match its category key.
4. Use uv for environments and commands.
5. Add the project's test command manually to Workbench Python CI when tests exist.
6. Add projects with auditable dependencies to the workflow's audit matrix.
7. Use `workbench/LICENSE` unless a project-local license takes precedence.

Ruff automatically scans the workbench tree, but tests and dependency audits are explicit workflow lists and do not discover new projects automatically.

### 6.4 Other Project or Userscript

For `others/<category>/<slug>`:

1. Update `others/README.md`.
2. Update the category README when one exists.
3. Add the project to `apps/landing/src/config/projects/others.ts` with an explicit lifecycle.
4. Add a local README and explicit license status.
5. If the project is a Node project outside `others/userscripts/*`, decide whether to expand `pnpm-workspace.yaml`; it is not included automatically.

New userscripts must also document installation, userscript-manager compatibility, and the committed-artifact policy. If an install URL points to generated `dist/` output, generate it through the project build and provide a drift check. Browser-heavy userscript validation belongs in a project-specific workflow unless several userscripts genuinely share the same harness.

## 7. Landing Catalog Rules

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

Every entry needs a unique repository-relative `path`, `title`, `summary`, `kind`, and time-zone-qualified ISO `updatedAt`. Keep the path taxonomy aligned with the kind. Do not edit card numbers, aggregate counts, or `projects.ts` for routine additions.

Use `externalUrl` only when a credential-free HTTPS deployment is the preferred card destination. Without it, the card intentionally links to the GitHub source path.

Use `showcase` only for a project with a representative visual:

- Store a unique PNG in `apps/landing/public/covers/`.
- Declare meaningful alt text and the real intrinsic dimensions.
- Update the cover when the visible project changes materially.
- Remove the cover when the showcase is removed; orphaned and reused covers fail validation.

`updatedAt` represents a material project change. Do not bump it for formatting, path correction, metadata cleanup, or a hostname typo. A first usable public release may count as a material update.

Landing SEO configuration describes the Cedarflake Lab landing site only. Every deployable app owns its own title, description, favicon, canonical URL, social metadata, and robots policy.

## 8. README and Live URL Rules

For an app with a stable public deployment, keep the same canonical endpoint in:

1. The root README Live column.
2. The project README.
3. Project-owned canonical or social metadata when the app exposes it.
4. Package `homepage` or userscript metadata only when those fields are intended to point to the deployment.

For a deployed app with a catalog entry, add `externalUrl` when the deployment is the preferred card destination. `apps/landing` is the catalog itself and has no catalog entry.

Before recording an endpoint:

- Verify the final credential-free HTTPS URL returns the intended app.
- Do not publish localhost, preview, expiring, private, or authentication-only URLs as Live.
- Use `—` in the root table when no stable public endpoint exists.
- For Vercel projects, verify the external Dashboard Root Directory as well as checked-in `vercel.json` or local workspace configuration.

When a domain changes, update every owning surface in the same change and search for the old URL. Removing a deployment requires removing or replacing stale public links; changing repository metadata alone does not disable the external deployment.

## 9. Workspace, Dependencies, and Generated Files

The pnpm workspace currently includes `apps/*`, `packages/*`, and `others/userscripts/*`.

- Use the repository-declared pnpm version and run installs from the root.
- After adding or moving a Node project, run pnpm install so `pnpm-lock.yaml` receives the correct importer path.
- Do not hand-edit or copy lockfile importers.
- Keep Node engines and build-script allowlists compatible with root policy.
- Use uv for Python work and update `uv.lock` or requirements through the owning tool.

Do not edit ordinary generated directories such as `dist/`, `.next/`, coverage, or caches. A generated artifact may be committed only when it is part of the delivery contract, such as an installable userscript. In that case:

1. Source remains authoritative.
2. The owning build script generates the artifact deterministically.
3. A check verifies that the committed output is current.
4. Path-specific ignore exceptions are narrow.

## 10. GitHub Actions Rules

Workflow filenames use:

```text
<scope>-<target>-<purpose>.yml
```

Allowed scopes:

- `repo`: repository-wide policy or security.
- `group`: one coherent collection of projects.
- `project`: one independently validated project.

Common purposes are `ci`, `security`, `release`, and `maintenance`. Targets use kebab-case. Display names begin with the matching `[Repo]`, `[Group]`, or `[Project]` prefix.

Current workflow ownership:

| File                                 | Responsibility                                                    |
| ------------------------------------ | ----------------------------------------------------------------- |
| `repo-codeql-security.yml`           | Repository JavaScript/TypeScript CodeQL analysis                  |
| `group-apps-packages-ci.yml`         | Baseline dependency audit, check, and build for apps and packages |
| `group-workbench-python-ci.yml`      | Workbench Ruff, registered tests, and dependency audits           |
| `project-liminal-drift-ci.yml`       | Liminal Drift project and browser validation                      |
| `project-youtube-auto-resume-ci.yml` | YouTube userscript unit, build-drift, and browser validation      |

For workflows that use path-filtered `pull_request` or `push` triggers:

- Match `pull_request.paths` and `push.paths` to the workflow's real ownership.
- Include the workflow's own path in both trigger lists.
- Include shared root files only when the additional coverage justifies the trigger cost. Do not make every project workflow run for every root lockfile change by default.
- Project workflows may rely on changes inside their own directory to trigger dependency validation. If an intentional lockfile-only change affects such a project and the task authorizes publishing the ref, run its `workflow_dispatch` check after push or expand the trigger as part of that change. Without push or dispatch authorization, run the equivalent local check and report that remote validation remains pending.
- Keep expensive browser, platform, or project-specific checks out of unrelated group workflows.
- When moving a project, update filters, working directories, package filters, artifact paths, and self-paths together.
- Before renaming a workflow, inspect repository rulesets, required checks or workflows, branch protection, badges, and external integrations. Preserve job IDs unless their consumers are also migrated.

A path-filtered project workflow must not be the only unconditional repository-wide required check: it can be skipped legitimately for unrelated changes. If branch protection is introduced, use path-aware rules or a stable aggregate check.

## 11. Moving or Renaming a Project

Use a history-preserving move, then search for the old path, package name, and URL. Update as applicable:

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

## 12. Archiving or Deleting a Project

Archiving retains source and history:

- Keep the project in the landing catalog because coverage validation still discovers its directory.
- Move an archived featured app or package to a catalog presentation that supports `lifecycle: "archived"`.
- Remove an obsolete showcase and its cover.
- Remove or replace a dead `externalUrl`.
- Mark the status near the top of the project README and in its owning index.
- Preserve licenses, attribution, and historical context.
- Decide explicitly whether project CI remains automatic, becomes manual, or is removed.
- Disable the external deployment separately.

The current landing model cannot directly mark featured or workbench entries as archived. Convert a featured project to a catalog card. For a workbench project, extend the type and UI model before archiving; deleting its entry alone is invalid.

Deleting source also requires deleting its catalog entry, cover, index rows, workspace and lockfile state, dedicated workflow, deployment, and path-specific documentation. Check for orphaned assets and old URLs.

## 13. Validation Routes

Run the smallest owning checks first:

| Area                                             | Minimum validation                                                                                                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary app or package                          | `pnpm --filter <package-name> check` and, when build output can change, `build`                                                                                  |
| Landing catalog, metadata, components, or styles | Run `pnpm --filter @cedarflake/landing check`; also run `build` for any production-visible catalog, component, style, document, SEO, asset, or deployment change |
| Focus Orb package/demo                           | Both workspace `check` scripts plus `pnpm check:focus-orb-package`                                                                                               |
| Liminal Drift gameplay, rendering, input, or UI  | Project `check` plus its documented canvas and interaction browser checks                                                                                        |
| Userscript with committed output                 | Project `check` and `build:check`; run browser coverage when behavior or UI changes                                                                              |
| Python workbench                                 | `uvx ruff format --check workbench`, `uvx ruff check workbench`, and the affected project's tests                                                                |
| Workflow change                                  | Validate YAML and inspect path filters and self-paths; review the Actions run only when push is authorized                                                       |

Run root `pnpm check` or `pnpm build` when shared configuration or multiple Node projects change. These commands intentionally include userscripts; the Apps & Packages workflow remains a narrower CI group.

For moves and URL changes, also run a repository search for every old identifier. Always finish with `git diff --check` and inspect the final diff.

## 14. Completion Checklist

Before considering a structural or catalog change complete, confirm:

- [ ] The project is in the correct taxonomy and directory depth.
- [ ] Project README and license status are explicit.
- [ ] Root and collection/category indexes are synchronized.
- [ ] Landing path, presentation, lifecycle, date, external URL, and cover are correct.
- [ ] Public Live URLs were verified and synchronized.
- [ ] Workspace metadata, lockfiles, and generated artifacts are current.
- [ ] CI naming, trigger scope, commands, and manual test/audit lists are current.
- [ ] Old paths, names, URLs, and orphaned assets are absent.
- [ ] Targeted validation passed and broader checks were run when the change crossed ownership boundaries.
- [ ] The final diff contains no unrelated edits.

Use English Conventional Commits with a concise summary. Commit or push only when explicitly requested.
