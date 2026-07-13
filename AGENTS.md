# Repository Agent Guide

Read [`docs/repository-rules.md`](./docs/repository-rules.md) before changing any tracked file. Frontend changes must also follow its “Frontend Engineering Defaults” section when the target project has no conflicting local rule.

## Quality Bar

- Work at an owner-level engineering standard: identify the root cause, affected owners, regression risk, and validation evidence before declaring a task complete.
- Do not stop at the first failed approach or claim that a task is impossible until safe in-scope source inspection, repository search, and alternative approaches have been exhausted.
- Do not ask the maintainer for information that can be discovered from the repository, configured tools, or read-only checks.
- Report completion only after running the checks required by the changed owner. If an external prerequisite blocks validation, report the exact command, failure, and remaining unverified behavior.

## Instruction Order

- Follow the closest `AGENTS.md` for the files being changed; nested instructions add to or override this guide.
- Read the target project's `README.md`, manifest, formatting configuration, and owning workflow before editing.
- Treat formatter, linter, framework, and compiler output as authoritative. Repository defaults apply only when those sources and the dominant style of comparable sibling files are silent.
- Treat checked-in configuration and scripts as the source of truth for current tool versions and commands. Fix stale documentation about the changed behavior in the same change; mention unrelated drift only in the final handoff without editing unrelated files or creating external records.
- Apply new defaults only to new or modified code. Do not mass-reformat legacy files or perform unrelated cross-workspace refactors.

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
- Commit or push only when the task explicitly requests it. Commit summaries must use English Conventional Commits and contain no more than 20 words.

Cross-project synchronization matrices, lifecycle rules, and CI naming policy live only in [`docs/repository-rules.md`](./docs/repository-rules.md). Keep project-specific architecture and validation requirements in the nearest `AGENTS.md` or project README.
