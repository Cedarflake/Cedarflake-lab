import type { OwnerSiteProfileDto } from "./owner-site-profile-repository"

export interface OwnerSiteProfileLoaderDependencies {
  authorize: () => Promise<unknown>
  readProfile: () => Promise<OwnerSiteProfileDto | null>
}

export function createOwnerSiteProfileLoader(
  dependencies: OwnerSiteProfileLoaderDependencies,
) {
  return async () => {
    await dependencies.authorize()
    return dependencies.readProfile()
  }
}
