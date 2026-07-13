import { useEffect, useRef, useState } from "react"

import { siteConfig } from "../config/site"
import type { ShowcaseProject } from "../types/project"
import { ProjectActions } from "./ProjectActions"

interface ProjectCardProps {
  project: ShowcaseProject
}

type CoverLoadState = "loading" | "ready" | "error"

const projectDateFormatter = new Intl.DateTimeFormat(siteConfig.locale, {
  day: "2-digit",
  month: "short",
  timeZone: siteConfig.timeZone,
  year: "numeric",
})

export function ProjectCard({ project }: ProjectCardProps) {
  const [coverLoadState, setCoverLoadState] = useState<CoverLoadState>("loading")
  const coverImageRef = useRef<HTMLImageElement>(null)
  const { cover, label, note, tags } = project.showcase

  useEffect(() => {
    const image = coverImageRef.current

    if (!image) {
      return
    }

    if (!image.complete) {
      setCoverLoadState("loading")
      return
    }

    setCoverLoadState(image.naturalWidth > 0 ? "ready" : "error")
  }, [cover.src])

  return (
    <article className="project-card">
      <div className="project-card__surface">
        <div className="project-card__cover" data-load-state={coverLoadState}>
          <img
            ref={coverImageRef}
            src={cover.src}
            alt={cover.alt}
            width={cover.width}
            height={cover.height}
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={() => setCoverLoadState("ready")}
            onError={() => setCoverLoadState("error")}
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
          </div>
          <p className="project-card__summary">{project.summary}</p>
          <footer className="project-card__footer">
            <ul className="tag-list" aria-label={`${project.title} technologies`}>
              {tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
            <code className="source-path">{project.path}</code>
            {note ? <span className="project-card__note">{note}</span> : null}
            <ProjectActions project={project} />
          </footer>
        </div>
      </div>
    </article>
  )
}
