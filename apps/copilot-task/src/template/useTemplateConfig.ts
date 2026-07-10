import { use } from "react";
import { TemplateConfigContext } from "./templateContext";

export function useTemplateConfig() {
  return use(TemplateConfigContext);
}
