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
pnpm check:focus-orb-package
```

The demo consumes `@cedarflake/focus-orb` through `workspace:*`. The root integration check builds the package and type-checks the demo's package-consumer fixture against the public API.

Use the [package README](../packages/focus-orb/README.md) for package API and build details, and the [demo README](../apps/focus-orb-demo/README.md) for project-specific development commands.
