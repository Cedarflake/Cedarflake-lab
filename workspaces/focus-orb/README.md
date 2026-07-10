# focus-orb

PNPM workspace for the Focus Orb package and demo.

## Workspace

| Path | Description |
| --- | --- |
| `packages/focus-orb` | Reusable React component package. |
| `apps/demo` | Vite playground for grouped parameter tuning and visual checks. |

## Commands

```bash
pnpm install
pnpm check
pnpm check:package
pnpm build
pnpm dev
```

The component package exports `FocusOrb`, `FocusOrbButton`, `FocusOrbBackground`, default option objects, grouped option types, and the bundled watercolor noise texture URL. The demo exposes the same adjustable groups as the package API: appearance, state, interaction, motion, audio, rendering, and shader material.
