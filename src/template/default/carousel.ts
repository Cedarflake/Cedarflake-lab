import type { TemplateCarouselConfig } from "../types";
import { ASSET_BASE } from "./assets";

export const carouselConfig: TemplateCarouselConfig = {
  images: [
    {
      id: "image-1",
      srcLight: `${ASSET_BASE}/images/tasks/waitlist/carousel/user-value-1-light.jpg`,
      srcDark: `${ASSET_BASE}/images/tasks/waitlist/carousel/user-value-1-dark.jpg`,
      alt: "An AI assistant organizing a user's task flow.",
      headline: "Plan the messy work",
      description:
        "Capture goals, constraints, and open questions, then turn them into a sequence your team can actually follow.",
    },
    {
      id: "image-2",
      srcLight: `${ASSET_BASE}/images/tasks/waitlist/carousel/user-value-2-light.jpg`,
      srcDark: `${ASSET_BASE}/images/tasks/waitlist/carousel/user-value-2-dark.jpg`,
      alt: "An AI assistant reviewing project context across documents.",
      headline: "Work with context",
      description:
        "Let the agent read nearby decisions, files, and notes before it recommends the next move.",
    },
    {
      id: "image-3",
      srcLight: `${ASSET_BASE}/images/tasks/waitlist/carousel/user-value-3-light.jpg`,
      srcDark: `${ASSET_BASE}/images/tasks/waitlist/carousel/user-value-3-dark.jpg`,
      alt: "An AI assistant handing off completed task results.",
      headline: "Finish with proof",
      description:
        "Ship with concise summaries, validation notes, and artifacts that make review faster.",
    },
  ],
};
