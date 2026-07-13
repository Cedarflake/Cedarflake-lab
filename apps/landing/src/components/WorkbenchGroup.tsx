import {
  ArrowUpRight,
  BrainCircuit,
  FolderOpen,
  Gamepad2,
  Images,
  Network,
  Workflow,
  type LucideIcon,
} from "lucide-react"

import { projectSourceUrl } from "../lib/projectCatalog"
import type { WorkbenchGroupData, WorkbenchIconName } from "../types/project"

const workbenchIconByName = {
  "brain-circuit": BrainCircuit,
  workflow: Workflow,
  "folder-open": FolderOpen,
  "gamepad-2": Gamepad2,
  images: Images,
  network: Network,
} satisfies Record<WorkbenchIconName, LucideIcon>

interface WorkbenchGroupProps {
  group: WorkbenchGroupData
}

export function WorkbenchGroup({ group }: WorkbenchGroupProps) {
  const CategoryIcon = workbenchIconByName[group.icon]

  return (
    <section className="workbench-group">
      <header className="workbench-group__header">
        <CategoryIcon className="workbench-group__icon" aria-hidden="true" strokeWidth={1.8} />
        <h3>{group.title}</h3>
      </header>
      <ul className="workbench-list">
        {group.items.map((item) => (
          <li key={item.path}>
            <a href={projectSourceUrl(item.path)} rel="noreferrer" target="_blank">
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
