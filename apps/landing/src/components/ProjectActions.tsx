import { Code2, Download, ExternalLink, type LucideIcon } from "lucide-react"

import { projectSourceUrl } from "../lib/projectCatalog"
import type { ProjectEntry, ProjectExternalActionKind } from "../types/project"

interface ProjectActionsProps {
  project: ProjectEntry
}

interface ExternalActionPresentation {
  accessibleVerb: string
  Icon: LucideIcon
  label: string
}

const externalActionPresentation = {
  install: {
    accessibleVerb: "Install",
    Icon: Download,
    label: "Install",
  },
  live: {
    accessibleVerb: "Open the live site for",
    Icon: ExternalLink,
    label: "Live",
  },
} satisfies Record<ProjectExternalActionKind, ExternalActionPresentation>

export function ProjectActions({ project }: ProjectActionsProps) {
  const externalAction = project.externalAction
  const externalPresentation = externalAction
    ? externalActionPresentation[externalAction.kind]
    : null

  return (
    <div className="project-actions">
      <a
        className="project-action project-action--source"
        data-project-action="source"
        href={projectSourceUrl(project.path)}
        rel="noreferrer"
        target="_blank"
        aria-label={`View ${project.title} source on GitHub (opens in a new tab)`}
      >
        <span>Source</span>
        <Code2 aria-hidden="true" />
      </a>
      {externalAction && externalPresentation ? (
        <a
          className={`project-action project-action--${externalAction.kind}`}
          data-project-action={externalAction.kind}
          href={externalAction.url}
          rel="noreferrer"
          target="_blank"
          aria-label={`${externalPresentation.accessibleVerb} ${project.title} (opens in a new tab)`}
        >
          <span>{externalPresentation.label}</span>
          <externalPresentation.Icon aria-hidden="true" />
        </a>
      ) : null}
    </div>
  )
}
