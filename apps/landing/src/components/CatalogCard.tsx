import { ArrowUpRight } from "lucide-react"

import { projectUrl } from "../lib/projectCatalog"
import type { CatalogProject } from "../types/project"

interface CatalogCardProps {
  project: CatalogProject
}

export function CatalogCard({ project }: CatalogCardProps) {
  return (
    <article className={`catalog-card${project.isMuted ? " catalog-card--muted" : ""}`}>
      <a href={projectUrl(project)} rel="noreferrer" target="_blank">
        <div className="catalog-card__topline">
          <span>{project.id}</span>
          <span>{project.status}</span>
        </div>
        <div className="catalog-card__title-row">
          <h3>{project.title}</h3>
          <ArrowUpRight aria-hidden="true" />
        </div>
        <p>{project.summary}</p>
        <code className="source-path">{project.path}</code>
      </a>
    </article>
  )
}
