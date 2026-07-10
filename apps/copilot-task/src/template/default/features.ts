import type { TemplateFeaturesConfig } from "../types";

export const featuresConfig: TemplateFeaturesConfig = {
  headline: "What makes the assistant useful?",
  subtitle:
    "A practical AI Agent layer for turning scattered intent into tracked plans, clear context, and finished work.",
  items: [
    {
      title: "Turns intent into a plan",
      description:
        "Describe the outcome once, then let the assistant break it into ordered steps, surface blockers, and keep the next action visible.",
      actionItems: [
        { label: "Planning", icon: "will" },
        { label: "Next steps", icon: "manifestation" },
      ],
    },
    {
      title: "Reads the room before acting",
      description:
        "It gathers relevant files, recent decisions, and product context before suggesting changes, so work starts with the right shape.",
      actionItems: [
        { label: "Context", icon: "resonance" },
        { label: "Memory", icon: "soulArray" },
      ],
    },
    {
      title: "Drafts, edits, and verifies",
      description:
        "From copy and code to checklists and summaries, the assistant can produce the first pass, refine it, and validate the result.",
      actionItems: [
        { label: "Drafting", icon: "bloom" },
        { label: "Review", icon: "mindRing" },
        { label: "Validation", icon: "dreamWeave" },
      ],
    },
    {
      title: "Connects everyday tools",
      description:
        "Bring together project files, documents, issues, and design assets without forcing your workflow through a new command center.",
      actionItems: [
        { label: "Files", icon: "teaCircle" },
        { label: "Docs", icon: "memoryLibrary" },
        { label: "Boards", icon: "illusionGarden" },
      ],
    },
    {
      title: "Keeps you in the loop",
      description:
        "Progress updates, reviewable diffs, and clear handoff notes make the agent feel dependable instead of mysterious.",
      actionItems: [
        { label: "Status", icon: "healing" },
        { label: "Handoffs", icon: "starSong" },
      ],
    },
  ],
};
