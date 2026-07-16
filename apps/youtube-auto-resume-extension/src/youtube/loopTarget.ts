const EXACT_NAVIGATION_INTENT_TTL_MS = 30_000
const GENERIC_NAVIGATION_INTENT_TTL_MS = 5_000
const UNEXPECTED_NAVIGATION_GUARD_TTL_MS = 10_000

interface NavigationIntent {
  expiresAt: number
  videoId: string | null
}

export interface LoopTargetController {
  armUnexpectedNavigationGuard: (now: number) => void
  configure: (enabled: boolean, currentVideoId: string | null) => void
  getTargetVideoId: () => string | null
  markUserNavigation: (videoId: string | null, now: number) => void
  resolveUnexpectedNavigation: (
    currentVideoId: string | null,
    now: number,
  ) => string | null
}

export function getWatchVideoId(url: string): string | null {
  try {
    const parsedUrl = new URL(url)
    const isYouTubeHost = parsedUrl.hostname === "youtube.com"
      || parsedUrl.hostname.endsWith(".youtube.com")

    if (!isYouTubeHost || parsedUrl.pathname !== "/watch") {
      return null
    }

    const videoId = parsedUrl.searchParams.get("v")?.trim() ?? ""
    return videoId || null
  } catch {
    return null
  }
}

export function createLoopTargetController(
  initialEnabled: boolean,
  initialVideoId: string | null,
): LoopTargetController {
  let isEnabled = initialEnabled
  let targetVideoId = initialEnabled ? initialVideoId : null
  let navigationIntent: NavigationIntent | null = null
  let unexpectedNavigationGuardExpiresAt = 0

  function configure(enabled: boolean, currentVideoId: string | null): void {
    if (!enabled) {
      isEnabled = false
      targetVideoId = null
      navigationIntent = null
      unexpectedNavigationGuardExpiresAt = 0
      return
    }

    if (!isEnabled || !targetVideoId) {
      targetVideoId = currentVideoId
    }

    isEnabled = true
  }

  function markUserNavigation(videoId: string | null, now: number): void {
    if (!isEnabled) {
      return
    }

    navigationIntent = {
      expiresAt: now + (
        videoId
          ? EXACT_NAVIGATION_INTENT_TTL_MS
          : GENERIC_NAVIGATION_INTENT_TTL_MS
      ),
      videoId,
    }
  }

  function armUnexpectedNavigationGuard(now: number): void {
    if (!isEnabled || !targetVideoId) {
      return
    }

    unexpectedNavigationGuardExpiresAt = now
      + UNEXPECTED_NAVIGATION_GUARD_TTL_MS
  }

  function resolveUnexpectedNavigation(
    currentVideoId: string | null,
    now: number,
  ): string | null {
    if (!isEnabled) {
      return null
    }

    if (!currentVideoId) {
      navigationIntent = null
      unexpectedNavigationGuardExpiresAt = 0
      return null
    }

    if (!targetVideoId) {
      targetVideoId = currentVideoId
      navigationIntent = null
      unexpectedNavigationGuardExpiresAt = 0
      return null
    }

    if (currentVideoId === targetVideoId) {
      if (navigationIntent?.videoId === currentVideoId) {
        navigationIntent = null
      }

      return null
    }

    const hasMatchingIntent = Boolean(
      navigationIntent
      && navigationIntent.expiresAt >= now
      && (
        navigationIntent.videoId === null
        || navigationIntent.videoId === currentVideoId
      ),
    )

    navigationIntent = null

    if (hasMatchingIntent) {
      targetVideoId = currentVideoId
      unexpectedNavigationGuardExpiresAt = 0
      return null
    }

    const isUnexpectedNavigationGuarded =
      unexpectedNavigationGuardExpiresAt > 0
      && unexpectedNavigationGuardExpiresAt >= now

    unexpectedNavigationGuardExpiresAt = 0

    if (!isUnexpectedNavigationGuarded) {
      targetVideoId = currentVideoId
      return null
    }

    return targetVideoId
  }

  return {
    armUnexpectedNavigationGuard,
    configure,
    getTargetVideoId: () => targetVideoId,
    markUserNavigation,
    resolveUnexpectedNavigation,
  }
}
