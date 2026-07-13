# focus-orb

PNPM workspace for the Focus Orb package and demo.

## Workspace

| Path                  | Description                                                     |
| --------------------- | --------------------------------------------------------------- |
| `packages/focus-orb`  | Reusable React component package.                               |
| `apps/focus-orb-demo` | Vite playground for grouped parameter tuning and visual checks. |

## Integration Commands

```bash
pnpm dev:focus-orb
pnpm --filter @cedarflake/focus-orb pack:check
pnpm check:focus-orb-package
```

The demo consumes `@cedarflake/focus-orb` through `workspace:*`. The package-level pack check builds the release candidate and validates its exact dry-run file list, public export targets, required contract metadata, and dry-run-selected package-file size budget. The root integration check then type-checks the demo's package-consumer fixture against that built public API.

The repository does not currently document an npm installation channel, and the demo has no canonical public deployment. Keep repository and Landing links pointed at source until a maintainer verifies and authorizes an external distribution or Live endpoint.

Use the [package README](../packages/focus-orb/README.md) for package API and build details, and the [demo README](../apps/focus-orb-demo/README.md) for project-specific development commands.
