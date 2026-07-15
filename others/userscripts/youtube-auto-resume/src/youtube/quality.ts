import {
  DEFAULT_SETTINGS,
  type QualityPreference,
  type YouTubeAutoResumeSettings,
} from "../core/settings.ts"
import {
  getPlayerAvailableQualityLevels,
  getPlayerPlaybackQuality,
  isPlayerShowingAd,
  setPlayerPlaybackQuality,
  type YouTubePlayerContextResolver,
  type YouTubePlayerElement,
} from "./player.ts"

const AVAILABLE_QUALITY_PRIORITY = [
  "highres",
  "hd4320",
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

const DEFAULT_THROTTLE_MS = 5_000

export interface QualityManagerOptions {
  getSettings?: () => Pick<YouTubeAutoResumeSettings, "preferredQuality">
  getPlayerContext: YouTubePlayerContextResolver
  getAvailableQualityLevels?: (player: YouTubePlayerElement) => string[] | null
  getPlaybackQuality?: (player: YouTubePlayerElement) => string | null
  setPlaybackQuality?: (
    player: YouTubePlayerElement,
    quality: string,
  ) => boolean
  onAction?: (message: string) => void
  throttleMs?: number
  now?: () => number
}

export interface QualityAttemptOptions {
  force?: boolean
}

export interface QualityManager {
  trySetPreferredQualityIfPossible(options?: QualityAttemptOptions): boolean
}

export function getQualityLabel(quality: string): string {
  const labels: Readonly<Record<QualityPreference, string>> = {
    auto: "YouTube 自动",
    hd4320: "4320p",
    hd2880: "2880p",
    hd2160: "2160p",
    hd1440: "1440p",
    hd1080: "1080p",
    hd720: "720p",
    large: "480p",
    medium: "360p",
    small: "240p",
    tiny: "144p",
  }

  return labels[quality as QualityPreference] ?? quality
}

export function resolvePreferredQuality(
  preference: QualityPreference,
  levels: readonly string[] | null | undefined,
): string | null {
  if (preference === "auto") {
    return preference
  }

  if (!levels?.length) {
    return null
  }

  if (levels.includes(preference)) {
    return preference
  }

  const preferenceIndex = AVAILABLE_QUALITY_PRIORITY.indexOf(preference)

  if (preferenceIndex === -1) {
    return null
  }

  return AVAILABLE_QUALITY_PRIORITY
    .slice(preferenceIndex + 1)
    .find((quality) => levels.includes(quality)) ?? null
}

export function createQualityManager(
  options: QualityManagerOptions,
): QualityManager {
  const getSettings = options.getSettings
    ?? (() => ({ preferredQuality: DEFAULT_SETTINGS.preferredQuality }))
  const getAvailableQualityLevels = options.getAvailableQualityLevels
    ?? getPlayerAvailableQualityLevels
  const getPlaybackQuality = options.getPlaybackQuality
    ?? getPlayerPlaybackQuality
  const setPlaybackQuality = options.setPlaybackQuality
    ?? setPlayerPlaybackQuality
  const onAction = options.onAction ?? (() => undefined)
  const throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS
  const getNow = options.now ?? Date.now
  let lastPlayer: YouTubePlayerElement | null = null
  let lastAppliedPreference: QualityPreference | null = null
  let lastAttemptAt = Number.NEGATIVE_INFINITY
  let lastRequestedPreference: QualityPreference | null = null

  function trySetPreferredQualityIfPossible(
    attemptOptions: QualityAttemptOptions = {},
  ): boolean {
    const force = attemptOptions.force === true
    const preference = getSettings().preferredQuality

    const context = options.getPlayerContext()

    if (!context || isPlayerShowingAd(context.player)) {
      return false
    }

    if (lastPlayer !== context.player) {
      lastPlayer = context.player
      lastAppliedPreference = null
      lastAttemptAt = Number.NEGATIVE_INFINITY
      lastRequestedPreference = null
    }

    if (lastRequestedPreference !== preference) {
      lastAppliedPreference = null
      lastAttemptAt = Number.NEGATIVE_INFINITY
      lastRequestedPreference = preference
    }

    const currentTime = getNow()

    if (!force && currentTime - lastAttemptAt < throttleMs) {
      return false
    }

    lastAttemptAt = currentTime

    const targetQuality = resolvePreferredQuality(
      preference,
      getAvailableQualityLevels(context.player),
    )

    if (
      !targetQuality
      || (preference === "auto" && lastAppliedPreference === preference)
      || (
        preference !== "auto"
        && getPlaybackQuality(context.player) === targetQuality
      )
    ) {
      return false
    }

    if (!setPlaybackQuality(context.player, targetQuality)) {
      return false
    }

    lastAppliedPreference = preference
    onAction(`已尝试将画质调为：${getQualityLabel(targetQuality)}`)
    return true
  }

  return { trySetPreferredQualityIfPossible }
}
