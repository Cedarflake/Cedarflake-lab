# YouTube Auto Resume Extension

A Manifest V3 browser extension for recovering paused YouTube playback, applying a selected target quality, and clicking only visible skip controls provided by YouTube.

## Status

Active migration. Version 0.1.0 establishes functional parity with the archived userscript and makes this application the new development owner. Store publication, extension-native settings storage, and toolbar or options surfaces are not implemented yet.

The migration baseline comes from [`others/userscripts/youtube-auto-resume`](../../others/userscripts/youtube-auto-resume/), frozen at userscript version 0.4.1 on July 15, 2026. The extension owns a separate source snapshot and does not import from the archive.

## Browser architecture

The extension builds separate unpacked directories for Chromium and Firefox from one Manifest V3 source. Its runtime is a static `MAIN`-world content script on `https://www.youtube.com/*` because target-quality selection depends on YouTube's page-side player API.

Running in the page world means YouTube can observe or interfere with the runtime. The extension therefore keeps no secrets in that world, requests no extension permissions, has no background worker, and transmits no data. During this first migration phase, settings remain in YouTube-origin local storage. A future extension-storage bridge must keep privileged APIs in an isolated content script.

## Build

Run commands from the repository root:

```bash
pnpm --filter @cedarflake/youtube-auto-resume-extension check
pnpm --filter @cedarflake/youtube-auto-resume-extension build
pnpm --filter @cedarflake/youtube-auto-resume-extension test:e2e
```

The browser test requires the Playwright Chromium binary:

```bash
pnpm --dir apps/youtube-auto-resume-extension exec playwright install chromium
```

Generated unpacked extensions are written to:

- `dist/chromium`
- `dist/firefox`

`dist/` is local build output and is not committed.

## Load locally

Build first, then load the directory for your browser:

- Chrome: open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/chromium`.
- Edge: open `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/chromium`.
- Firefox 128+: open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `dist/firefox/manifest.json`.

These are local development packages, not verified store releases. No browser-store install URL exists yet.

## Migration roadmap

1. Preserve userscript behavior behind a minimal cross-browser MV3 manifest.
2. Move persistence from YouTube local storage to an isolated extension-storage bridge with explicit migration.
3. Add extension-owned controls such as a toolbar popup or options page without duplicating the in-player panel.
4. Extend the automated unpacked-extension injection coverage from Chromium to Firefox.
5. Prepare signed packages and store metadata only after local behavior and privacy boundaries are stable.

## Source layout

```text
scripts/build.ts          deterministic Chromium and Firefox unpacked builds
scripts/manifest.ts       typed Manifest V3 definitions
src/entry.ts              idempotent MAIN-world extension entry
src/app.ts                application orchestration and scheduling
src/appStatus.ts          player and settings status projection
src/core/                 settings, playback state, typing, and time utilities
src/ui/                   panel, controls, mounting, styles, and Aurora animation
src/youtube/              player, quality, and visible ad-control integration
tests/                    unit, manifest, panel, and runtime regression coverage
```

## License

[MIT](./LICENSE)
