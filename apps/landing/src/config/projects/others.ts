import type { CatalogProject } from "../../types/project"

export const otherProjectEntries = [
  {
    id: "O-01",
    title: "Bilibili Follow Cycle",
    path: "others/userscripts/bilibili-follow-cycle",
    updatedAt: "2026-07-11T01:01:23+08:00",
    summary:
      "A browser userscript for controlled follow and unfollow cycles with interval and log panels.",
    status: "Userscript",
    kind: "other",
    presentation: "catalog",
    section: "others",
  },
  {
    id: "O-02",
    title: "GitHub Star Cycle",
    path: "others/github-actions/star-cycle",
    updatedAt: "2026-07-11T01:01:23+08:00",
    summary:
      "A retired Star and Unstar workflow experiment preserved as an intentionally inactive archive.",
    status: "Archive",
    kind: "other",
    presentation: "catalog",
    section: "others",
    isMuted: true,
  },
] as const satisfies readonly CatalogProject[]
