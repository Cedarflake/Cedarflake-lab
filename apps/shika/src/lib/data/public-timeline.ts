import "server-only"

import { getDatabaseConnection } from "@/lib/db/client"
import { readTimelineEnvironment } from "@/lib/env/server"
import { createPublicCursorCodec } from "@/lib/timeline/public-cursor"

import { readPublicTimelinePage } from "./public-timeline-repository"

interface GetPublicTimelinePageInput {
  limit: number
  cursor?: string | null
}

export async function getPublicTimelinePage(input: GetPublicTimelinePageInput) {
  const environment = readTimelineEnvironment()

  return readPublicTimelinePage(await getDatabaseConnection(), {
    ...input,
    cursorCodec: createPublicCursorCodec(environment.cursorSecret),
  })
}
