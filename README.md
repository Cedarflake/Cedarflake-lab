# Liminal Drift

A dreamcore 3D driving game built with React 19, TypeScript, Vite, Three.js, React Three Fiber, Drei, and Zustand.

Drive through a soft, empty highway made of pastel road plates, pool-blue edges, floating mall signs, memory shards, signal boost gates, near misses, and checkpoints that feel like half-remembered exits.

## Gameplay

- Chase checkpoints to score and repair the car.
- Hit signal boost gates for speed bursts and score pulses.
- Collect memory shards for small score pulses between bigger hazards.
- Drift through bends to bank charge, then release to cash out.
- Slip past obstacles for near-miss rewards, but collisions damage integrity.
- Keep a local best score across runs.

## Scripts

Requires Node.js 22 through 24 and pnpm 11.

```txt
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm format
pnpm format:check
pnpm check
pnpm check:bundle
pnpm check:canvas -- <server-url>
pnpm check:interaction -- <server-url>
pnpm check:licenses
pnpm check:rules
```

## Verification

- `pnpm check` runs formatting checks, lint, procedural generation checks, game-rule checks, license policy checks, production build, and bundle budget checks.
- `pnpm check:bundle` verifies the built JS/CSS assets stay within raw and gzip size budgets.
- `pnpm check:canvas -- <url>` captures desktop and mobile screenshots, checks the 3D scene is visible and moving, verifies modal focus / telemetry / progress semantics, and covers blocked local storage, invalid best-score storage, reduced-motion CSS, and repeated Escape input.
- `pnpm check:interaction -- <url>` verifies mobile Start + Go touch driving advances speed and distance, and that touch input resets when pausing.
- `pnpm check:licenses` blocks strong copyleft and commercial-restriction licenses from the dependency tree.
- `pnpm check:rules` verifies small gameplay rule boundaries that do not need a browser.

## Controls

- Drive: `W` / `S` or `Up` / `Down`
- Steer: `A` / `D` or `Left` / `Right`
- Drift: `Space` or `Shift`
- Pause: `Esc`
- Gamepad: left stick / D-pad to steer, triggers to drive and brake, shoulders to drift
- Touch: on-screen buttons on mobile viewports

## Project Structure

```txt
src/
  app/       React app shell and global game UI styling
  entities/ 3D game entities such as the car, track, obstacles, and checkpoints
  game/     Input handling, state store, generation rules, and numeric helpers
  scenes/   React Three Fiber scene composition and frame loop
  shared/   Shared TypeScript types
  ui/       HUD and menu overlays
scripts/
  checkBundleBudget.mjs  Production bundle size budget check
  checkCanvas.mjs       Playwright screenshot and canvas pixel verification
  checkGameRules.ts     Gameplay rule boundary checks
  checkInteraction.mjs  Playwright mobile touch driving smoke check
  checkLicenses.mjs     Dependency license policy check
public/
  fonts/                Bundled UI font subset and license
```

## Notes

- The project targets React 19 and the current React Three Fiber 9 / Drei 10 line.
- UI text uses a bundled Space Grotesk subset under the SIL Open Font License.
- `pnpm-workspace.yaml` contains the pnpm 11 project settings, including engine checks against Node 22.22.2, strict 24-hour release-age checks, and the `use-sync-external-store` override used to keep peer dependencies clean.
- Mobile rendering is verified with Playwright. The scene keeps the canvas DPR at `1` for stable headless mobile WebGL output.
