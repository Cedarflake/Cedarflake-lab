# YouTube Auto Resume

A userscript for recovering paused YouTube playback, handling skippable ads, and selecting the best available quality.

## Features

- Resumes playback after a configurable pause threshold
- Clicks YouTube's visible skip-ad and overlay-close controls
- Optionally selects the highest available playback quality
- Provides a YouTube-inspired control panel isolated with Shadow DOM
- Reattaches the panel when YouTube's single-page navigation replaces page content
- Exposes userscript menu commands for opening and resetting the panel

## Install

Install [Tampermonkey](https://www.tampermonkey.net/) or another compatible userscript manager, then open the raw built script:

```text
https://raw.githubusercontent.com/Cedarflake/Cedarflake-Lab/main/others/userscripts/youtube-auto-resume/dist/youtube-auto-resume.user.js
```

Automatic ad skipping is disabled by default. Enable it from the floating launcher; the script only activates visible YouTube skip and overlay-close controls.

## Development

The project uses Node.js 22, pnpm, TypeScript, and esbuild.

```bash
pnpm install
pnpm build
pnpm check
```

`pnpm build` writes the installable userscript to `dist/youtube-auto-resume.user.js`. Do not edit the generated file directly. `pnpm build:check` verifies that the committed build matches the TypeScript source.

## Structure

```text
scripts/build.ts        esbuild configuration and userscript metadata
src/core/settings.ts    normalized persistent settings
src/ui/panel.ts         isolated and resilient panel view
src/youtube/            YouTube player, ad, and quality integrations
src/app.ts              application state and scheduling
src/entry.ts            userscript API registration and application startup
tests/                  Node.js type-stripping tests
```

## License

[MIT](./LICENSE)
