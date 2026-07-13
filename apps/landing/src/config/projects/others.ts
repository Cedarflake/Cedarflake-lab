import type { CatalogProject } from "../../types/project"

export const otherProjectEntries = [
  {
    title: "YouTube Auto Resume",
    path: "others/userscripts/youtube-auto-resume",
    externalAction: {
      kind: "install",
      url: "https://raw.githubusercontent.com/Cedarflake/Cedarflake-Lab/main/others/userscripts/youtube-auto-resume/dist/youtube-auto-resume.user.js",
    },
    updatedAt: "2026-07-13T13:05:36+08:00",
    summary:
      "A YouTube userscript for playback recovery, guarded ad handling, and a resilient Shadow DOM panel with a persistent Aurora launcher.",
    label: "Userscript",
    lifecycle: "active",
    kind: "other",
    presentation: "catalog",
    section: "others",
  },
  {
    title: "Bilibili Follow Cycle",
    path: "others/userscripts/bilibili-follow-cycle",
    updatedAt: "2026-07-11T01:01:23+08:00",
    summary:
      "A browser userscript for controlled follow and unfollow cycles with interval and log panels.",
    label: "Userscript",
    lifecycle: "archived",
    kind: "other",
    presentation: "catalog",
    section: "others",
  },
  {
    title: "GitHub Star Cycle",
    path: "others/github-actions/star-cycle",
    updatedAt: "2026-07-11T01:01:23+08:00",
    summary:
      "A retired Star and Unstar workflow experiment preserved as an intentionally inactive archive.",
    label: "GitHub action",
    lifecycle: "archived",
    kind: "other",
    presentation: "catalog",
    section: "others",
  },
  {
    title: "Google AI Mode Aurora Study",
    path: "others/interface-studies/google-ai-mode-aurora",
    updatedAt: "2026-07-12T22:02:53+08:00",
    summary:
      "A static forensic study and dependency-free reproduction of Google Search's cursor-following Aurora edge glow.",
    label: "Interface study",
    lifecycle: "active",
    kind: "other",
    presentation: "catalog",
    section: "others",
  },
] as const satisfies readonly CatalogProject[]
