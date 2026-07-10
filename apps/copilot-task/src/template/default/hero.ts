import type { TemplateHeroConfig } from "../types";
import { ASSET_BASE } from "./assets";

export const heroConfig: TemplateHeroConfig = {
  headlineTop: "Your AI Agent",
  headlineBottom: "for focused work",
  description:
    "An always-ready assistant that plans tasks, gathers context, drafts next steps, and keeps projects moving while you stay in control.",
  backgroundLight: `${ASSET_BASE}/images/tasks/waitlist/background/background-light.jpg`,
  backgroundDark: `${ASSET_BASE}/images/tasks/waitlist/background/background-dark.jpg`,
  scrollIndicator: "See how it works",
};
