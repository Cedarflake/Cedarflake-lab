# YouTube Auto Resume

A userscript for recovering paused YouTube playback, applying a chosen quality preference, and using YouTube-provided ad controls from a resilient panel.

## Status

Archived on July 15, 2026 at version 0.4.1. This directory is a frozen, reproducible userscript snapshot; ongoing development has moved to the [YouTube Auto Resume Extension](../../../apps/youtube-auto-resume-extension/).

The archived release includes a persistent target-quality selector and control-only ad handling: it can use visible controls provided by YouTube, but it does not block, hide, accelerate, or seek through ads.

## Features

- Resumes playback after a configurable pause threshold
- Applies a selected target quality to the active YouTube player, with a closest-lower fallback when the exact level is unavailable
- Clicks only visible YouTube skip controls without modifying ad playback, overlays, or network requests
- Suspends automatic and manual playback recovery while YouTube marks the active player as an ad
- Suspends playback recovery and ad-control automation while YouTube shows an in-player enforcement message
- Provides a YouTube-inspired Shadow DOM panel whose collapsed launcher keeps a full Aurora ring and switches to pointer-tracked edge light on hover
- Reattaches the panel when YouTube's single-page navigation replaces page content
- Exposes userscript menu commands for opening and resetting the panel

The launcher adapts the layered glow documented by the repository's [Google AI Mode Aurora interface study](../../interface-studies/google-ai-mode-aurora/). One Aurora layer morphs continuously between states: the initial sweep expands into a complete ring, hover contracts that ring toward the pointer, and leaving expands it back. This keeps the static and dynamic shapes mutually exclusive without a hard visual cut. Pointer tracking stops while hidden or destroyed; reduced motion skips the sweep and keeps hover feedback static.

## Install

The historical release remains installable for reproducibility. Install [Tampermonkey](https://www.tampermonkey.net/) or another compatible userscript manager, then open the script:

[Install YouTube Auto Resume](https://raw.githubusercontent.com/Cedarflake/Cedarflake-Lab/main/others/userscripts/youtube-auto-resume/dist/youtube-auto-resume.user.js)

Choose a target quality from the floating launcher; the default leaves selection to YouTube. A fixed target uses the exact level when available and otherwise falls back to the closest available lower level. Quality selection never runs while YouTube marks the active player as an ad. Automatic ad-control handling is disabled by default. The script clicks a visible skip control only when YouTube exposes that control in the active player. While YouTube marks the active player as an ad, playback recovery is suspended. If an ad is not skippable, the script leaves it untouched so it plays normally. If YouTube displays an in-player enforcement message, the script backs off instead of attempting to bypass or dismiss it.

## Support

The supported page scope is the top-level desktop site at `https://www.youtube.com/*`. YouTube Music, mobile YouTube, embedded players, and framed playback are outside the current scope.

| Userscript manager | Browser                             | Support status                                                              |
| ------------------ | ----------------------------------- | --------------------------------------------------------------------------- |
| Tampermonkey       | Chrome and Edge 109+                | Primary installation target                                                 |
| Violentmonkey      | Chrome, Edge 109+, and Firefox 115+ | Expected to work with the APIs used; not covered by automated manager tests |
| Other managers     | Any browser                         | Not verified                                                                |

The build targets Chrome and Edge 109+ and Firefox 115+. Automated browser coverage runs panel and runtime fixtures against Chromium without a userscript-manager sandbox.

## Limitations

- YouTube's private DOM selectors and internal player behavior can change without notice.
- Target-quality selection depends on YouTube's internal quality APIs and available levels; YouTube may still adapt the stream after selection.
- Ad handling cannot guarantee every YouTube ad format. Unskippable ads play normally, and a control that YouTube does not expose cannot be activated by the script.
- Browser autoplay policy can reject a programmatic resume until the user interacts with the page.
- Settings are stored in page-local storage for the current browser profile.

## Development

The project uses Node.js 22, pnpm, TypeScript, and esbuild.

Run these commands from the repository root. Chromium installation is required once on a new machine because `pnpm check` includes the Playwright panel and runtime tests.

```bash
pnpm install
pnpm --dir others/userscripts/youtube-auto-resume exec playwright install chromium
pnpm --filter @cedarflake/youtube-auto-resume build
pnpm --filter @cedarflake/youtube-auto-resume check
```

`pnpm --filter @cedarflake/youtube-auto-resume build` writes the installable userscript to `dist/youtube-auto-resume.user.js`. Do not edit the generated file directly. `pnpm --filter @cedarflake/youtube-auto-resume build:check` verifies that the committed build matches the TypeScript source.

Every change that alters the generated userscript must also increase `package.json`'s SemVer precedence before release. Pull-request and non-initial main-branch push CI compare the generated output with the base revision and reject equal, downgraded, invalid, or build-metadata-only version changes.

## Structure

```text
scripts/build.ts        esbuild configuration and userscript metadata
src/core/settings.ts    normalized persistent settings
src/ui/fabAurora.ts     launcher Aurora DOM rendering and interaction lifecycle
src/ui/fabAuroraMotion.ts pure Aurora motion calculations
src/ui/panel.ts         panel state, persistence, and lifecycle controller
src/ui/panelShell.ts    panel Shadow DOM structure and element references
src/ui/panelControls.ts reusable panel control factories
src/ui/panelMount.ts    fullscreen-aware host mounting and isolation
src/ui/panel*Styles.ts  base, responsive, theme, and accessibility styles
src/youtube/            YouTube player, quality, and ad-control integrations
src/app.ts              application orchestration and scheduling
src/appStatus.ts        player and settings status projection
src/entry.ts            userscript API registration and application startup
tests/                  Node.js unit tests and Playwright panel/runtime fixtures
```

## License

[MIT](./LICENSE)
