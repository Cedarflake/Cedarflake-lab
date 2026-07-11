import { ArrowUpRight } from "lucide-react"

import { projectUrl } from "../lib/projectCatalog"
import type { ShowcaseProject } from "../types/project"

interface ProjectCardProps {
  project: ShowcaseProject
}

const projectDateFormatter = new Intl.DateTimeFormat("en", {
  day: "2-digit",
  month: "short",
  timeZone: "Asia/Shanghai",
  year: "numeric",
})

export function ProjectCard({ project }: ProjectCardProps) {
  const { cover, label, note, tags } = project.showcase

  return (
    <article className="project-card">
      <a className="project-card__link" href={projectUrl(project)} rel="noreferrer" target="_blank">
        <div className="project-card__cover">
          <img
            src={cover.src}
            alt={cover.alt}
            width={cover.width}
            height={cover.height}
            loading="lazy"
            decoding="async"
          />
        </div>
        <div className="project-card__body">
          <div className="project-card__meta">
            <span>{label}</span>
            <time dateTime={project.updatedAt}>
              Updated {projectDateFormatter.format(new Date(project.updatedAt))}
            </time>
          </div>
          <div className="project-card__title-row">
            <h3>{project.title}</h3>
            <ArrowUpRight aria-hidden="true" />
          </div>
          <p className="project-card__summary">{project.summary}</p>
          <div className="project-card__footer">
            <ul className="tag-list" aria-label={`${project.title} technologies`}>
              {tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
            <code className="source-path">{project.path}</code>
          </div>
          {note ? <span className="project-card__note">{note}</span> : null}
        </div>
      </a>
    </article>
  )
}
