import { createContext } from "react";
import { copilotTasksTemplateConfig } from "./defaultTemplate";
import type { LandingPageTemplateConfig } from "./types";

export const TemplateConfigContext =
  createContext<LandingPageTemplateConfig>(copilotTasksTemplateConfig);
