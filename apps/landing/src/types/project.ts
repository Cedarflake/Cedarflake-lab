import type { WorkbenchCategory } from "../config/workbench"

export type ProjectKind = "app" | "package" | "workbench" | "other"

export interface ProjectCover {
  src: `/covers/${string}.png`
  alt: string
  width: number
  height: number
}

export interface ProjectShowcase {
  label: string
  tags: readonly string[]
  note?: string
  cover: ProjectCover
}

interface ProjectBase {
  id: string
  title: string
  path: string
  updatedAt: string
  summary: string
  kind: ProjectKind
  externalUrl?: string
  showcase?: ProjectShowcase
}

export interface FeaturedProject extends ProjectBase {
  presentation: "featured"
  section: "featured"
  showcase: ProjectShowcase
}

export interface CatalogProject extends ProjectBase {
  presentation: "catalog"
  section: "building" | "others"
  status: string
  isMuted?: boolean
}

export interface WorkbenchProject extends ProjectBase {
  presentation: "workbench"
  section: "workbench"
  category: WorkbenchCategory
}

export type ProjectEntry = FeaturedProject | CatalogProject | WorkbenchProject

export type ShowcaseProject = ProjectEntry & { showcase: ProjectShowcase }

export interface WorkbenchGroupData {
  id: string
  title: string
  items: readonly WorkbenchProject[]
}

export interface LabStat {
  value: string
  label: string
}
