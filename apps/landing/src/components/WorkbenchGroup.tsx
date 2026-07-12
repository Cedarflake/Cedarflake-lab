import { ArrowUpRight } from "lucide-react"

import { projectUrl } from "../lib/projectCatalog"
import type { WorkbenchGroupData } from "../types/project"

interface WorkbenchGroupProps {
  group: WorkbenchGroupData
}

export function WorkbenchGroup({ group }: WorkbenchGroupProps) {
  return (
    <section className="workbench-group">
      <header className="workbench-group__header">
        <span>{group.id}</span>
        <h3>{group.title}</h3>
      </header>
      <ul className="workbench-list">
        {group.items.map((item) => (
          <li key={item.path}>
            <a href={projectUrl(item)} rel="noreferrer" target="_blank">
              <div>
                <strong>{item.title}</strong>
                <code className="source-path">{item.path}</code>
              </div>
              <p>{item.summary}</p>
              <ArrowUpRight aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
