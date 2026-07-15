export interface PublicTimelineOrderKey {
  effectiveAt: number
  recordedAt: number
  publicOrdinal: number
  publicEntryId: string
}

export interface PublicTimelineEntry extends PublicTimelineOrderKey {
  summary: string
}

export interface PublicTimelineCursor {
  version: 1
  asOfPublicOrdinal: number
  privacyEpoch: number
  last: PublicTimelineOrderKey | null
}

export interface PublicTimelineClock {
  publicOrdinal: number
  privacyEpoch: number
}

export type PublicTimelineEffect =
  | "private"
  | "publish"
  | "withdraw"
  | "redact"
  | "suppress"

function isNonnegativeInteger(value: number) {
  return Number.isSafeInteger(value) && value >= 0
}

export function advancePublicTimelineClock(
  clock: PublicTimelineClock,
  effect: PublicTimelineEffect,
): PublicTimelineClock {
  if (
    !isNonnegativeInteger(clock.publicOrdinal) ||
    !isNonnegativeInteger(clock.privacyEpoch)
  ) {
    throw new DomainRuleError(
      "INVALID_TIMELINE_CLOCK",
      "Timeline clock values must be nonnegative safe integers",
    )
  }

  if (effect === "private") return { ...clock }

  return {
    publicOrdinal: clock.publicOrdinal + 1,
    privacyEpoch:
      effect === "redact" || effect === "suppress"
        ? clock.privacyEpoch + 1
        : clock.privacyEpoch,
  }
}

function assertValidTimelineInput({
  limit,
  latestPublicOrdinal,
  currentPrivacyEpoch,
  cursor,
}: Omit<PagePublicTimelineInput, "entries">) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new DomainRuleError(
      "INVALID_TIMELINE_LIMIT",
      "Timeline page limit must be an integer between 1 and 100",
    )
  }

  if (
    !isNonnegativeInteger(latestPublicOrdinal) ||
    !isNonnegativeInteger(currentPrivacyEpoch)
  ) {
    throw new DomainRuleError(
      "INVALID_TIMELINE_CLOCK",
      "Timeline clock values must be nonnegative safe integers",
    )
  }

  if (!cursor) return

  const isValidCursor =
    cursor.version === 1 &&
    isNonnegativeInteger(cursor.asOfPublicOrdinal) &&
    isNonnegativeInteger(cursor.privacyEpoch) &&
    cursor.asOfPublicOrdinal <= latestPublicOrdinal &&
    (cursor.last === null ||
      (isNonnegativeInteger(cursor.last.effectiveAt) &&
        isNonnegativeInteger(cursor.last.recordedAt) &&
        isNonnegativeInteger(cursor.last.publicOrdinal) &&
        cursor.last.publicOrdinal <= cursor.asOfPublicOrdinal &&
        cursor.last.publicEntryId.length > 0))

  if (!isValidCursor) {
    throw new DomainRuleError(
      "INVALID_TIMELINE_CURSOR",
      "Timeline cursor is invalid",
    )
  }
}

export type PublicTimelinePage =
  | {
      kind: "page"
      entries: readonly PublicTimelineEntry[]
      nextCursor: PublicTimelineCursor | null
    }
  | {
      kind: "reset"
      entries: readonly []
      nextCursor: null
    }

export function comparePublicTimelineOrder(
  left: PublicTimelineOrderKey,
  right: PublicTimelineOrderKey,
) {
  return (
    right.effectiveAt - left.effectiveAt ||
    right.recordedAt - left.recordedAt ||
    right.publicOrdinal - left.publicOrdinal ||
    right.publicEntryId.localeCompare(left.publicEntryId)
  )
}

export interface PagePublicTimelineInput {
  entries: readonly PublicTimelineEntry[]
  limit: number
  latestPublicOrdinal: number
  currentPrivacyEpoch: number
  cursor: PublicTimelineCursor | null
}

export function pagePublicTimeline({
  entries,
  limit,
  latestPublicOrdinal,
  currentPrivacyEpoch,
  cursor,
}: PagePublicTimelineInput): PublicTimelinePage {
  assertValidTimelineInput({
    limit,
    latestPublicOrdinal,
    currentPrivacyEpoch,
    cursor,
  })

  if (cursor && cursor.privacyEpoch !== currentPrivacyEpoch) {
    return { kind: "reset", entries: [], nextCursor: null }
  }

  const asOfPublicOrdinal = cursor?.asOfPublicOrdinal ?? latestPublicOrdinal
  const ordered = entries
    .filter((entry) => entry.publicOrdinal <= asOfPublicOrdinal)
    .toSorted(comparePublicTimelineOrder)
    .filter(
      (entry) =>
        cursor?.last === null ||
        cursor === null ||
        comparePublicTimelineOrder(entry, cursor.last) > 0,
    )

  const pageEntries = ordered.slice(0, limit)
  const last = pageEntries.at(-1)
  const hasMore = ordered.length > pageEntries.length

  return {
    kind: "page",
    entries: pageEntries,
    nextCursor:
      hasMore && last
        ? {
            version: 1,
            asOfPublicOrdinal,
            privacyEpoch: currentPrivacyEpoch,
            last: {
              effectiveAt: last.effectiveAt,
              recordedAt: last.recordedAt,
              publicOrdinal: last.publicOrdinal,
              publicEntryId: last.publicEntryId,
            },
          }
        : null,
  }
}
import { DomainRuleError } from "./errors"
