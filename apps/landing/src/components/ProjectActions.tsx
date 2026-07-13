import { Code2, Download, Globe2, type LucideIcon } from "lucide-react"

import { projectSourceUrl } from "../lib/projectCatalog"
import type { ProjectEntry, ProjectExternalActionKind } from "../types/project"

interface ProjectActionsProps {
  project: ProjectEntry
}

interface ExternalActionPresentation {
  accessibleVerb: string
  Icon: LucideIcon
  title: string
}

const externalActionPresentation = {
  install: {
    accessibleVerb: "Install",
    Icon: Download,
    title: "Install",
  },
  live: {
    accessibleVerb: "Open the live site for",
    Icon: Globe2,
    title: "Open live site",
  },
} satisfies Record<ProjectExternalActionKind, ExternalActionPresentation>

export function ProjectActions({ project }: ProjectActionsProps) {
  const externalAction = project.externalAction
  const externalPresentation = externalAction
    ? externalActionPresentation[externalAction.kind]
    : null

  return (
    <div className="project-actions">
      {externalAction && externalPresentation ? (
        <a
          className={`project-action project-action--${externalAction.kind}`}
          data-project-action={externalAction.kind}
          href={externalAction.url}
          rel="noreferrer"
          target="_blank"
          title={externalPresentation.title}
          aria-label={`${externalPresentation.accessibleVerb} ${project.title} (opens in a new tab)`}
        >
          <externalPresentation.Icon aria-hidden="true" strokeWidth={1.7} />
        </a>
      ) : null}
      <a
        className="project-action project-action--source"
        data-project-action="source"
        href={projectSourceUrl(project.path)}
        rel="noreferrer"
        target="_blank"
        title="View source"
        aria-label={`View ${project.title} source on GitHub (opens in a new tab)`}
      >
        <Code2 aria-hidden="true" strokeWidth={1.7} />
      </a>
    </div>
  )
}
