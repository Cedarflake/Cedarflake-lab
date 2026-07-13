# Engineering Notes

Follow the existing project style first.

- Use pnpm for all Node package commands.
- Keep React component behavior at the top, rendered structure in the middle, and related presentation at the bottom or in the component stylesheet.
- Keep game-domain logic in `src/game`, 3D entities in `src/entities`, scene composition in `src/scenes`, and HUD/overlay controls in `src/ui`.
- Use TypeScript strictness: avoid `any`, avoid non-null assertions, and prefer precise interfaces for object shapes.
- Do not introduce system-font-only UI. Bundle or explicitly document project fonts.
- Keep the Three.js scene full-bleed and verify desktop and mobile screenshots after visual changes.
- Run commands from the repository root. For changes that affect gameplay, rendering, input, or UI, run `pnpm --filter liminal-drift format:check`, `pnpm --filter liminal-drift check`, `pnpm --filter liminal-drift check:canvas -- <url>`, and `pnpm --filter liminal-drift check:interaction -- <url>`.
- Use Conventional Commits when the task explicitly requests a commit. Do not commit or push otherwise.
