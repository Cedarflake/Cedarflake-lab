import {
  DEFAULT_SETTINGS,
  type YouTubeAutoResumeSettings,
} from "../core/settings.ts"
import {
  getAvailableQualityLevels,
  getPlaybackQuality,
  isAdShowing,
  setPlaybackQuality,
} from "./player.ts"

const QUALITY_PRIORITY = [
  "highres",
  "hd2880",
  "hd2160",
  "hd1440",
  "hd1080",
  "hd720",
  "large",
  "medium",
  "small",
  "tiny",
] as const

export interface QualityManagerOptions {
  getSettings?: () => Pick<YouTubeAutoResumeSettings, "bestQuality">
  onAction?: (message: string) => void
  document?: Document
  throttleMs?: number
  now?: () => number
}

export interface QualityAttemptOptions {
  force?: boolean
}

export interface QualityManager {
  trySetBestQualityIfPossible(options?: QualityAttemptOptions): boolean
}

export function pickBestQuality(
  levels: readonly string[] | null | undefined,
): string | null {
  if (!levels?.length) {
    return null
  }

  for (const quality of QUALITY_PRIORITY) {
    if (levels.includes(quality)) {
      return quality
    }
  }

  for (const quality of levels) {
    if (quality && quality !== "auto") {
      return quality
    }
  }

  return levels[0] || null
}

export function createQualityManager(
  options: QualityManagerOptions = {},
): QualityManager {
  const getSettings =
    options.getSettings ??
    (() => ({ bestQuality: DEFAULT_SETTINGS.bestQuality }))
  const onAction = options.onAction ?? (() => undefined)
  const documentRef = options.document ?? document
  const throttleMs = options.throttleMs ?? 5000
  const getNow = options.now ?? Date.now
  let lastQualitySetAt = 0

  function trySetBestQualityIfPossible(
    attemptOptions: QualityAttemptOptions = {},
  ): boolean {
    const force = Boolean(attemptOptions.force)

    if (!getSettings().bestQuality && !force) {
      return false
    }

    const currentTime = getNow()

    if (!force && currentTime - lastQualitySetAt < throttleMs) {
      return false
    }

    if (!force && isAdShowing(documentRef)) {
      return false
    }

    const bestQuality = pickBestQuality(
      getAvailableQualityLevels(documentRef),
    )

    if (!bestQuality) {
      return false
    }

    const currentQuality = getPlaybackQuality(documentRef)

    if (!force && currentQuality === bestQuality) {
      lastQualitySetAt = currentTime
      return false
    }

    setPlaybackQuality(bestQuality, documentRef)
    lastQualitySetAt = currentTime
    onAction(`已尝试将画质调为最高：${bestQuality}`)
    return true
  }

  return { trySetBestQualityIfPossible }
}
