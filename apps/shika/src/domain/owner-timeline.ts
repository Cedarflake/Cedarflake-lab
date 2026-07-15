import { DomainRuleError } from "./errors"

export const ownerTimelineSourceTypes = [
  "status_transition",
  "incident_update",
  "maintenance_event",
] as const

export type OwnerTimelineSourceType =
  (typeof ownerTimelineSourceTypes)[number]

export interface OwnerTimelineOrderKey {
  ownerOrdinal: number
}

export interface OwnerTimelineCursor {
  version: 1
  asOfOwnerOrdinal: number
  lastOwnerOrdinal: number | null
}

export interface PageOwnerTimelineInput<Entry extends OwnerTimelineOrderKey> {
  entries: readonly Entry[]
  limit: number
  latestOwnerOrdinal: number
  cursor: OwnerTimelineCursor | null
}

export interface OwnerTimelinePage<Entry extends OwnerTimelineOrderKey> {
  entries: readonly Entry[]
  nextCursor: OwnerTimelineCursor | null
}

function isNonnegativeSafeInteger(value: number) {
  return Number.isSafeInteger(value) && value >= 0
}

export function assertOwnerTimelinePageRequest({
  limit,
  latestOwnerOrdinal,
  cursor,
}: Omit<PageOwnerTimelineInput<OwnerTimelineOrderKey>, "entries">) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new DomainRuleError(
      "INVALID_OWNER_TIMELINE_LIMIT",
      "Owner timeline page limit must be an integer between 1 and 100",
    )
  }

  if (!isNonnegativeSafeInteger(latestOwnerOrdinal)) {
    throw new DomainRuleError(
      "INVALID_OWNER_TIMELINE_CLOCK",
      "Owner timeline clock must be a nonnegative safe integer",
    )
  }

  if (!cursor) return

  const isValidCursor =
    cursor.version === 1 &&
    isNonnegativeSafeInteger(cursor.asOfOwnerOrdinal) &&
    cursor.asOfOwnerOrdinal <= latestOwnerOrdinal &&
    (cursor.lastOwnerOrdinal === null ||
      (Number.isSafeInteger(cursor.lastOwnerOrdinal) &&
        cursor.lastOwnerOrdinal > 0 &&
        cursor.lastOwnerOrdinal <= cursor.asOfOwnerOrdinal))

  if (!isValidCursor) {
    throw new DomainRuleError(
      "INVALID_OWNER_TIMELINE_CURSOR",
      "Owner timeline cursor is invalid",
    )
  }
}

export function compareOwnerTimelineOrder(
  left: OwnerTimelineOrderKey,
  right: OwnerTimelineOrderKey,
) {
  return right.ownerOrdinal - left.ownerOrdinal
}

export function pageOwnerTimeline<Entry extends OwnerTimelineOrderKey>({
  entries,
  limit,
  latestOwnerOrdinal,
  cursor,
}: PageOwnerTimelineInput<Entry>): OwnerTimelinePage<Entry> {
  assertOwnerTimelinePageRequest({ limit, latestOwnerOrdinal, cursor })

  const asOfOwnerOrdinal = cursor?.asOfOwnerOrdinal ?? latestOwnerOrdinal
  const ordered = entries
    .filter(
      (entry) =>
        entry.ownerOrdinal <= asOfOwnerOrdinal &&
        (cursor?.lastOwnerOrdinal === null ||
          cursor === null ||
          entry.ownerOrdinal < cursor.lastOwnerOrdinal),
    )
    .toSorted(compareOwnerTimelineOrder)
  const seenOrdinals = new Set<number>()

  for (const entry of ordered) {
    if (seenOrdinals.has(entry.ownerOrdinal)) {
      throw new DomainRuleError(
        "DUPLICATE_OWNER_TIMELINE_ORDINAL",
        "Owner timeline source ordinals must be globally unique",
      )
    }

    seenOrdinals.add(entry.ownerOrdinal)
  }

  const pageEntries = ordered.slice(0, limit)
  const last = pageEntries.at(-1)
  const hasMore = ordered.length > pageEntries.length

  return {
    entries: pageEntries,
    nextCursor:
      hasMore && last
        ? {
            version: 1,
            asOfOwnerOrdinal,
            lastOwnerOrdinal: last.ownerOrdinal,
          }
        : null,
  }
}
