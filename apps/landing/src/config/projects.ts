import type { ProjectEntry } from "../types/project"
import { buildingProjectEntries } from "./projects/building"
import { featuredProjectEntries } from "./projects/featured"
import { otherProjectEntries } from "./projects/others"
import { workbenchProjectEntries } from "./projects/workbench"

export const projectCatalog = [
  ...featuredProjectEntries,
  ...buildingProjectEntries,
  ...workbenchProjectEntries,
  ...otherProjectEntries,
] as const satisfies readonly ProjectEntry[]
