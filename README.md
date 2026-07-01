# Liminal Drift

A dreamcore 3D driving game prototype built with React 19, TypeScript, Vite, Three.js, React Three Fiber, Drei, and Zustand.

Drive through a soft, empty highway made of pastel road plates, pool-blue edges, floating mall signs, signal boost gates, near misses, and checkpoints that feel like half-remembered exits.

## Gameplay

- Chase checkpoints to score and repair the car.
- Hit signal boost gates for speed bursts and score pulses.
- Drift through bends to bank charge, then release to cash out.
- Slip past obstacles for near-miss rewards, but collisions damage integrity.
- Keep a local best score across runs.

## Scripts

```txt
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm format
pnpm format:check
pnpm check
pnpm check:canvas -- <dev-server-url>
pnpm check:interaction -- <dev-server-url>
```

## Verification

- `pnpm check` runs formatting checks, lint, procedural generation checks, and production build.
- `pnpm check:canvas -- <url>` captures desktop and mobile screenshots, checks the 3D scene is visible, and verifies speed / distance telemetry advances.
- `pnpm check:interaction -- <url>` verifies mobile Start + Go touch driving advances speed and distance.

## Controls

- Drive: `W` / `S` or `Up` / `Down`
- Steer: `A` / `D` or `Left` / `Right`
- Drift: `Space` or `Shift`
- Pause: `Esc`
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
  checkCanvas.mjs       Playwright screenshot and canvas pixel verification
  checkInteraction.mjs  Playwright mobile touch driving smoke check
public/
  fonts/                Bundled UI font subset and license
```

## Notes

- The project targets React 19 and the current React Three Fiber 9 / Drei 10 line.
- UI text uses a bundled Space Grotesk subset under the SIL Open Font License.
- `pnpm-workspace.yaml` contains the pnpm 11 project settings, including the `use-sync-external-store` override used to keep peer dependencies clean.
- Mobile rendering is verified with Playwright. The scene keeps the canvas DPR at `1` for stable headless mobile WebGL output.
