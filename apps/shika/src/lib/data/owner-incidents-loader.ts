import type { OwnerIncidentDto } from "./owner-incidents-repository"

export interface OwnerIncidentsLoaderDependencies {
  authorize: () => Promise<unknown>
  readIncidents: () => Promise<readonly OwnerIncidentDto[]>
}

export function createOwnerIncidentsLoader(
  dependencies: OwnerIncidentsLoaderDependencies,
) {
  return async () => {
    await dependencies.authorize()
    return dependencies.readIncidents()
  }
}
