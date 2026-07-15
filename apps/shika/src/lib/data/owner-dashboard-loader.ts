import type { OwnerDashboardDto } from "./owner-dashboard-repository"

export interface OwnerDashboardLoaderDependencies {
  authorize: () => Promise<unknown>
  readDashboard: (now: number) => Promise<OwnerDashboardDto>
}

export function createOwnerDashboardLoader(
  dependencies: OwnerDashboardLoaderDependencies,
) {
  return async (now = Date.now()) => {
    await dependencies.authorize()
    return dependencies.readDashboard(now)
  }
}
