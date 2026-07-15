import "server-only"

import { requireOwner } from "@/lib/auth/require-owner"
import { getDatabaseConnection } from "@/lib/db/client"

import { createOwnerTimelineLoader } from "./owner-timeline-loader"
import {
  readOwnerTimelinePage,
  type ReadOwnerTimelinePageInput,
} from "./owner-timeline-repository"

const loadOwnerTimelinePage = createOwnerTimelineLoader({
  authorize: requireOwner,
  readTimeline: async (input) =>
    readOwnerTimelinePage(await getDatabaseConnection(), input),
})

export function getOwnerTimelinePage(input: ReadOwnerTimelinePageInput) {
  return loadOwnerTimelinePage(input)
}
