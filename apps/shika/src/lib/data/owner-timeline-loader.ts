import type { ReadOwnerTimelinePageInput } from "./owner-timeline-repository"
import type { OwnerTimelinePageDto } from "./owner-timeline-repository"

export interface OwnerTimelineLoaderDependencies {
  authorize: () => Promise<unknown>
  readTimeline: (
    input: ReadOwnerTimelinePageInput,
  ) => Promise<OwnerTimelinePageDto>
}

export function createOwnerTimelineLoader(
  dependencies: OwnerTimelineLoaderDependencies,
) {
  return async (input: ReadOwnerTimelinePageInput) => {
    await dependencies.authorize()
    return dependencies.readTimeline(input)
  }
}
