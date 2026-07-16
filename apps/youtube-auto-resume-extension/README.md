# YouTube Auto Resume Extension

A Chromium Manifest V3 extension for recovering paused YouTube playback, looping the current video, applying a selected target quality, and activating visible YouTube skip controls.

## Status

Active migration. Version 0.1.0 establishes functional parity with the archived userscript and makes this application the new development owner. Store publication, extension-native settings storage, and toolbar or options surfaces are not implemented yet.

The migration baseline comes from [`others/userscripts/youtube-auto-resume`](../../others/userscripts/youtube-auto-resume/), frozen at userscript version 0.4.1 on July 15, 2026. The extension owns a separate source snapshot and does not import from the archive.

Automatic ad skipping is opt-in and only acts when YouTube exposes a visible, enabled native skip button. The extension does not remove ad elements, alter ad playback time, rewrite player responses, or intercept YouTube network traffic. The in-player panel retains a manual native-button bridge as a fallback.

Automatic looping is also opt-in. It captures the current video when the extension loads with looping enabled, when looping is enabled later, and whenever navigation settles on another video. The extension rechecks YouTube's own player-level loop control when playback metadata changes, playback starts, SPA navigation finishes, or an ad transition ends; it leaves the player untouched while an ad is active. Remembered-video recovery is armed only for a short window after an ad transition, a lost loop state, or the current video ending. Normal navigation becomes the new loop target, including trusted selections from YouTube controls or custom video cards. It restores the previous player loop value when the feature is disabled or the active player changes. Existing `avoidEnded` settings are migrated to the inverse `autoLoop` value.

## Browser architecture

The extension targets Chromium only and produces one unpacked package. Firefox is not supported because the trusted-input path depends on Chromium's `chrome.debugger` API.

The page runtime is a static `MAIN`-world content script on `https://www.youtube.com/*` because target-quality selection depends on YouTube's page-side player API. A separate `ISOLATED` content script validates the visible native skip target and asks the background worker to dispatch a browser-trusted pointer action at that target.

Automatic skipping requires the manifest `debugger` permission. When enabled and a skip target appears, the background worker attaches to that YouTube tab only for the input sequence and detaches immediately afterward. Chromium can show an installation warning and a temporary debugging notification while this happens. If another debugger owns the tab or attachment fails, the extension backs off and does not fall back to a synthetic page click.

Running part of the extension in the page world means YouTube can observe or interfere with that runtime. The extension keeps no secrets there and transmits no data. Settings currently remain in YouTube-origin local storage; a future extension-storage bridge must keep privileged APIs in an isolated content script.

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

The generated unpacked extension is written to `dist/chromium`. `dist/` is local build output and is not committed.

## Load locally

Build first, then load the Chromium package:

- Chrome: open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/chromium`.
- Edge: open `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/chromium`.
- Other Chromium browsers: open their extension management page and load `dist/chromium` as an unpacked extension.

These are local development packages, not verified store releases. No browser-store install URL exists yet.

## Migration roadmap

1. Preserve the archived userscript's playback and quality behavior in a Chromium MV3 extension.
2. Keep automatic skip opt-in, restricted to visible native controls, and covered by trusted-input regression tests.
3. Move persistence from YouTube local storage to an isolated extension-storage bridge with explicit migration.
4. Add extension-owned controls such as a toolbar popup or options page without duplicating the in-player panel.
5. Prepare signed packages and store metadata only after local behavior and privacy boundaries are stable.

## Source layout

```text
scripts/build.ts          deterministic Chromium unpacked build
scripts/manifest.ts       typed Chromium Manifest V3 definition
src/chromium/             isolated target bridge, messages, and background input worker
src/entry.ts              idempotent MAIN-world extension entry
src/app.ts                application orchestration and scheduling
src/appStatus.ts          player and settings status projection
src/core/                 settings, playback state, typing, and time utilities
src/ui/                   panel, controls, mounting, styles, and Aurora animation
src/youtube/              player, quality, and visible ad-control integration
tests/                    unit, manifest, panel, runtime, and extension regression coverage
```

## License

[MIT](./LICENSE)
