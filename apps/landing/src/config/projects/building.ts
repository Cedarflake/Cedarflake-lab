import type { CatalogProject } from "../../types/project"

export const buildingProjectEntries = [
  {
    title: "YouTube Auto Resume Extension",
    path: "apps/youtube-auto-resume-extension",
    updatedAt: "2026-07-15T22:14:41+08:00",
    summary:
      "A cross-browser Manifest V3 playback assistant migrating the archived userscript into an extension-owned runtime.",
    label: "Browser extension",
    lifecycle: "active",
    kind: "app",
    presentation: "catalog",
    section: "building",
  },
  {
    title: "Shika",
    path: "apps/shika",
    updatedAt: "2026-07-15T16:01:36+08:00",
    summary:
      "A single-owner personal status app with private operations and explicitly published public history.",
    label: "Rebuild",
    lifecycle: "active",
    kind: "app",
    presentation: "catalog",
    section: "building",
    showcase: {
      label: "Personal status app",
      tags: ["Next.js", "Turso", "Privacy-first"],
      cover: {
        src: "/covers/shika.png",
        alt: "Shika public status page showing an unreported state and no active incidents",
        width: 1600,
        height: 900,
      },
    },
  },
  {
    title: "Focus Orb Playground",
    path: "apps/focus-orb-demo",
    updatedAt: "2026-07-11T10:09:02+08:00",
    summary:
      "An interactive bench for tuning the WebGL orb as a focus button or ambient background.",
    label: "Demo",
    lifecycle: "active",
    kind: "app",
    presentation: "catalog",
    section: "building",
    showcase: {
      label: "Interactive playground",
      tags: ["React", "WebGL", "Component demo"],
      cover: {
        src: "/covers/focus-orb-demo.png",
        alt: "Focus Orb Playground controls and WebGL orb",
        width: 1600,
        height: 900,
      },
    },
  },
  {
    title: "Focus Orb",
    path: "packages/focus-orb",
    updatedAt: "2026-07-11T10:09:02+08:00",
    summary:
      "The reusable React WebGL component behind the playground, packaged for app-level composition.",
    label: "Package",
    lifecycle: "active",
    kind: "package",
    presentation: "catalog",
    section: "building",
  },
  {
    title: "Personal Email",
    path: "apps/personal-email",
    updatedAt: "2026-07-11T10:09:02+08:00",
    summary:
      "React Email templates and local scripts for rendering, selecting, and delivering personal mail.",
    label: "Local tool",
    lifecycle: "active",
    kind: "app",
    presentation: "catalog",
    section: "building",
  },
] as const satisfies readonly CatalogProject[]
