import type { CatalogProject } from "../types/project"
import { ProjectActions } from "./ProjectActions"

interface CatalogCardProps {
  displayNumber: string
  project: CatalogProject
}

export function CatalogCard({ displayNumber, project }: CatalogCardProps) {
  const isArchived = project.lifecycle === "archived"

  return (
    <article className="catalog-card" data-lifecycle={project.lifecycle}>
      <div className="catalog-card__surface">
        <div className="catalog-card__topline">
          <span>{displayNumber}</span>
          <div className="catalog-card__labels">
            <span>{project.label}</span>
            {isArchived ? <strong className="catalog-card__archive">Archived</strong> : null}
          </div>
        </div>
        <div className="catalog-card__title-row">
          <h3>{project.title}</h3>
        </div>
        <p>{project.summary}</p>
        <footer className="catalog-card__footer">
          <code className="source-path">{project.path}</code>
          <ProjectActions project={project} />
        </footer>
      </div>
    </article>
  )
}
