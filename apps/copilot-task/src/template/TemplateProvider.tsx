import type { ReactNode } from "react";
import { TemplateConfigContext } from "./templateContext";
import { copilotTasksTemplateConfig } from "./defaultTemplate";
import type { LandingPageTemplateConfig } from "./types";

export function TemplateProvider({
  config = copilotTasksTemplateConfig,
  children,
}: {
  config?: LandingPageTemplateConfig;
  children: ReactNode;
}) {
  return <TemplateConfigContext value={config}>{children}</TemplateConfigContext>;
}
