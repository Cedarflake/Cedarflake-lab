import type { OwnerMaintenanceWindowDto } from "./owner-maintenance-repository"

export interface OwnerMaintenanceLoaderDependencies {
  authorize: () => Promise<unknown>
  readMaintenance: (
    now: number,
  ) => Promise<readonly OwnerMaintenanceWindowDto[]>
}

export function createOwnerMaintenanceLoader(
  dependencies: OwnerMaintenanceLoaderDependencies,
) {
  return async (now = Date.now()) => {
    await dependencies.authorize()
    return dependencies.readMaintenance(now)
  }
}
