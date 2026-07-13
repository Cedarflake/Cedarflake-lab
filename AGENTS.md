# Repository Agent Guide

Read [`docs/repository-rules.md`](./docs/repository-rules.md) before changing project structure, catalog metadata, documentation indexes, Live links, workspace configuration, or GitHub Actions.

## Instruction Order

- Follow the closest `AGENTS.md` for the files being changed; nested instructions add to or override this guide.
- Read the target project's `README.md`, manifest, formatting configuration, and owning workflow before editing.
- Treat checked-in configuration and scripts as the source of truth for current tool versions and commands. Fix stale documentation about the changed behavior in the same change; mention unrelated drift only in the final handoff without editing unrelated files or creating external records.
- Preserve the established local style and avoid unrelated cross-workspace refactors.

## Repository Map

- `apps/` contains runnable applications, sites, and product-style demos.
- `packages/` contains reusable frontend packages.
- `workbench/<category>/` contains local Python utilities and small projects.
- `others/<category>/` contains userscripts, interface studies, retired experiments, and other material outside the apps, packages, and Python workbench taxonomy.

## Working Rules

- Use pnpm for Node.js work and run package commands from the repository root with `pnpm --filter <package-name> <script>`.
- Use uv for Python environments and tools.
- Start with the smallest validation owned by the changed project. Run broader repository checks only when shared configuration or multiple projects changed.
- Do not edit generated output directly. Regenerate committed artifacts through their owning build script and verify that source and output match.
- Do not create, expose, or commit secrets, local environment files, downloads, caches, or runtime data.
- Preserve unrelated user changes in a dirty worktree.
- Use English Conventional Commits. Do not commit or push unless the task explicitly requests it.

Cross-project synchronization matrices, lifecycle rules, and CI naming policy live only in [`docs/repository-rules.md`](./docs/repository-rules.md). Keep project-specific architecture and validation requirements in the nearest `AGENTS.md` or project README.
