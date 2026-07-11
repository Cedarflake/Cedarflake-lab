import type { ProjectKind } from "../types/project"
import { workbenchCategories } from "./workbench"

export const siteConfig = {
  name: "Cedarflake Lab",
  repositoryUrl: "https://github.com/Cedarflake/Cedarflake-Lab",
  repositoryBranch: "main",
  stats: [
    { kind: "app", label: "Apps" },
    { kind: "package", label: "Package" },
    { kind: "workbench", label: "Workbench tools" },
    { kind: "other", label: "Other experiments" },
  ] satisfies readonly { kind: ProjectKind; label: string }[],
  header: {
    brand: "Cedarflake",
    edition: "Lab / 2026",
    homeLabel: "Cedarflake Lab home",
    sourceLabel: "GitHub",
  },
  navigation: [
    { label: "Projects", href: "#projects" },
    { label: "Workbench", href: "#workbench" },
    { label: "Open bench", href: "#open-bench" },
  ],
  hero: {
    eyebrow: "A personal monorepo · shared tooling, distinct boundaries",
    brandImage: "/Lab.png",
    brandAlt: "Cedarflake Lab",
    statement: "Small tools, strange interfaces, and experiments in motion.",
    description:
      "Apps, reusable components, local utilities, and prototypes live here together—sharing an engineering layer without losing their own shape.",
    primaryAction: { label: "Explore the index", href: "#projects" },
    secondaryActionLabel: "View source",
    ruler: ["01 / Index", "Living archive"],
  },
  sections: {
    featured: {
      id: "projects",
      carouselHint: "Drag, scroll, or use arrow keys",
      heading: {
        index: "01",
        eyebrow: "Latest projects",
        titleId: "projects-title",
        title: "Fresh from the bench.",
        description:
          "Recent visual and product-facing work, ordered by its latest project update. Scroll sideways to keep exploring.",
      },
    },
    building: {
      id: "building-blocks",
      carouselHint: "More building blocks along the shelf",
      heading: {
        index: "02",
        eyebrow: "Building blocks",
        titleId: "blocks-title",
        title: "Reusable parts and practical tools.",
        description:
          "Demos, packages, and local workflows that support the bigger experiments without pretending to be products.",
      },
    },
    workbench: {
      id: "workbench",
      heading: {
        index: "03",
        eyebrow: "Local workbench",
        titleId: "workbench-title",
        title: "Utilities kept close to the machine.",
        description:
          "Focused Python projects for automation, media, files, games, AI, and campus networking.",
      },
      note: "Local-first by design. These entries point to source rather than promising a hosted service.",
    },
    others: {
      id: "other-shelves",
      carouselHint: "More oddities along the shelf",
      heading: {
        index: "04",
        eyebrow: "Other shelves",
        titleId: "others-title",
        title: "Useful things that resist a neat label.",
        description:
          "The odd edges remain visible instead of being forced into an app-shaped box, including userscripts and intentionally inactive archives.",
      },
    },
  },
  workbenchCategories,
  openBench: {
    id: "open-bench",
    titleId: "open-bench-title",
    eyebrow: "05 / Open bench",
    title: "One workspace. A few useful doors.",
    commands: ["pnpm install", "pnpm check", "pnpm build"],
    actionLabel: "Enter the repository",
  },
  footer: {
    note: "Built as a living index, not a finished catalogue.",
    backToTopLabel: "Back to top ↑",
  },
} as const
