import type { FeaturedProject } from "../../types/project"

export const featuredProjectEntries = [
  {
    title: "Copilot Task Study",
    path: "apps/copilot-task",
    externalUrl: "https://3kf1.test.i0c.cc/",
    updatedAt: "2026-07-11T11:20:33+08:00",
    summary:
      "A motion-led recreation of the animated Copilot Tasks preview, rebuilt in React for close study.",
    kind: "app",
    presentation: "featured",
    section: "featured",
    showcase: {
      label: "Interface study",
      note: "Unofficial study recreation",
      tags: ["React", "Motion", "Vite"],
      cover: {
        src: "/covers/copilot-task.png",
        alt: "Copilot Task Study interface preview",
        width: 1600,
        height: 900,
      },
    },
  },
  {
    title: "Liminal Drift",
    path: "apps/liminal-drift",
    externalUrl: "https://4po7.test.i0c.cc/",
    updatedAt: "2026-07-11T12:40:45+08:00",
    summary:
      "A dreamcore 3D driving game about pastel highways, memory fragments, and half-remembered exits.",
    kind: "app",
    presentation: "featured",
    section: "featured",
    showcase: {
      label: "Playable experiment",
      tags: ["React Three Fiber", "Three.js", "Game"],
      cover: {
        src: "/covers/liminal-drift.png",
        alt: "Liminal Drift pastel highway gameplay",
        width: 1440,
        height: 900,
      },
    },
  },
  {
    title: "Maimai Transition",
    path: "apps/maimai-transition",
    externalUrl: "https://7gkp.test.i0c.cc/",
    updatedAt: "2026-07-11T11:20:33+08:00",
    summary:
      "A kinetic scene-swap study that turns a rhythm-game-inspired opening into a reusable transition.",
    kind: "app",
    presentation: "featured",
    section: "featured",
    showcase: {
      label: "Motion experiment",
      note: "Unofficial technical demo",
      tags: ["React", "GSAP", "Motion"],
      cover: {
        src: "/covers/maimai-transition.png",
        alt: "Maimai Transition pastel scene artwork",
        width: 1920,
        height: 1080,
      },
    },
  },
  {
    title: "Shika",
    path: "apps/shika",
    updatedAt: "2026-07-11T10:08:42+08:00",
    summary:
      "A bilingual personal status page for life sections, incidents, maintenance events, and uptime notes.",
    kind: "app",
    presentation: "featured",
    section: "featured",
    showcase: {
      label: "Status prototype",
      tags: ["Next.js", "i18n", "Themes"],
      cover: {
        src: "/covers/shika.png",
        alt: "Shika personal status page preview",
        width: 1600,
        height: 900,
      },
    },
  },
] as const satisfies readonly FeaturedProject[]
