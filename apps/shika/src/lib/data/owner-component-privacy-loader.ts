import type { OwnerComponentPrivacyReviewDto } from "./owner-component-privacy-repository"

export interface OwnerComponentPrivacyLoaderDependencies {
  authorize: () => Promise<unknown>
  readReview: (
    componentId: string,
  ) => Promise<OwnerComponentPrivacyReviewDto | null>
}

export function createOwnerComponentPrivacyLoader(
  dependencies: OwnerComponentPrivacyLoaderDependencies,
) {
  return async (componentId: string) => {
    await dependencies.authorize()
    return dependencies.readReview(componentId)
  }
}
