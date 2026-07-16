export interface YouTubePlayerElement extends HTMLElement {
  getAvailableQualityLevels?: () => unknown
  getLoopVideo?: () => unknown
  getPlaybackQuality?: () => unknown
  setLoopVideo?: (enabled: boolean) => void
  setPlaybackQuality?: (quality: string) => void
  setPlaybackQualityRange?: (minimum: string, maximum: string) => void
}

export interface ActiveYouTubePlayerContext {
  player: YouTubePlayerElement
  video: HTMLVideoElement
}

export type YouTubePlayerContextResolver =
  () => ActiveYouTubePlayerContext | null

const PLAYER_SELECTOR = "#movie_player, .html5-video-player"
const ACTIVE_SHORTS_SELECTOR = [
  "ytd-reel-video-renderer[is-active]",
  "ytd-reel-video-renderer[active]",
].join(", ")
const MINIPLAYER_SELECTOR = "ytd-miniplayer, .ytdMiniplayerComponentHost"

function hasHiddenStyle(element: Element): boolean {
  const view = element.ownerDocument.defaultView

  if (!view) {
    return false
  }

  let current: Element | null = element

  while (current) {
    const style = view.getComputedStyle(current)

    if (
      style.display === "none"
      || style.visibility === "hidden"
      || style.visibility === "collapse"
      || Number(style.opacity) === 0
    ) {
      return true
    }

    current = current.parentElement
  }

  return false
}

function getViewportArea(
  element: Element,
  documentRef: Document,
): number {
  if (hasHiddenStyle(element)) {
    return 0
  }

  const rect = element.getBoundingClientRect()

  if (rect.width <= 0 || rect.height <= 0) {
    return 0
  }

  const view = documentRef.defaultView
  const viewportWidth =
    view?.innerWidth ?? documentRef.documentElement.clientWidth
  const viewportHeight =
    view?.innerHeight ?? documentRef.documentElement.clientHeight

  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return rect.width * rect.height
  }

  const visibleWidth = Math.max(
    0,
    Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0),
  )
  const visibleHeight = Math.max(
    0,
    Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0),
  )

  return visibleWidth * visibleHeight
}

function isFullscreenPlayer(
  player: YouTubePlayerElement,
  fullscreenElement: Element | null,
): boolean {
  return Boolean(
    fullscreenElement
    && (
      player === fullscreenElement
      || player.contains(fullscreenElement)
      || fullscreenElement.contains(player)
    ),
  )
}

function getPlayerScore(
  context: ActiveYouTubePlayerContext,
  documentRef: Document,
): number {
  const playerArea = getViewportArea(context.player, documentRef)
  const videoArea = getViewportArea(context.video, documentRef)
  const visibleArea = Math.min(playerArea, videoArea)
  const pathname = documentRef.location.pathname
  const isWatchPlayer = pathname === "/watch"
    && context.player.closest("ytd-watch-flexy") !== null
  const isActiveShortPlayer = (
    pathname === "/shorts"
    || pathname.startsWith("/shorts/")
  ) && context.player.closest(ACTIVE_SHORTS_SELECTOR) !== null
  const isMiniplayer = context.player.closest(MINIPLAYER_SELECTOR) !== null
  const isFullscreen = isFullscreenPlayer(
    context.player,
    documentRef.fullscreenElement,
  )

  if (
    !isWatchPlayer
    && !isActiveShortPlayer
    && !isMiniplayer
    && !isFullscreen
  ) {
    return Number.NEGATIVE_INFINITY
  }

  let score = Math.max(visibleArea, 0)

  if (isMiniplayer) {
    score += 2_000_000_000_000
  }

  if (isWatchPlayer || isActiveShortPlayer) {
    score += 3_000_000_000_000
  }

  if (isFullscreen) {
    score += 4_000_000_000_000
  }

  return score
}

export function resolveActivePlayerContext(
  documentRef: Document = document,
): ActiveYouTubePlayerContext | null {
  let activeContext: ActiveYouTubePlayerContext | null = null
  let activeScore = Number.NEGATIVE_INFINITY

  const players = Array.from(
    documentRef.querySelectorAll<YouTubePlayerElement>(PLAYER_SELECTOR),
  )

  for (const player of players) {
    const video =
      player.querySelector<HTMLVideoElement>("video.html5-main-video")
      ?? player.querySelector<HTMLVideoElement>("video")

    if (!video) {
      continue
    }

    const context = { player, video }
    const score = getPlayerScore(context, documentRef)

    if (score > activeScore) {
      activeContext = context
      activeScore = score
    }
  }

  return activeContext
}

export function getVideo(
  documentRef: Document = document,
): HTMLVideoElement | null {
  return resolveActivePlayerContext(documentRef)?.video ?? null
}

export function getMoviePlayer(
  documentRef: Document = document,
): YouTubePlayerElement | null {
  return resolveActivePlayerContext(documentRef)?.player ?? null
}

export function isPlayerShowingAd(player: YouTubePlayerElement): boolean {
  return (
    player.classList.contains("ad-showing")
    || player.classList.contains("ad-interrupting")
  )
}

export function getPlayerPlaybackQuality(
  player: YouTubePlayerElement,
): string | null {
  if (!player.getPlaybackQuality) {
    return null
  }

  try {
    const quality = player.getPlaybackQuality()
    return typeof quality === "string" ? quality : null
  } catch {
    return null
  }
}

export function getPlayerAvailableQualityLevels(
  player: YouTubePlayerElement,
): string[] | null {
  if (!player.getAvailableQualityLevels) {
    return null
  }

  try {
    const levels = player.getAvailableQualityLevels()

    if (!Array.isArray(levels)) {
      return null
    }

    return levels.filter((level): level is string => typeof level === "string")
  } catch {
    return null
  }
}

export function getPlayerLoopVideo(
  player: YouTubePlayerElement,
): boolean | null {
  if (!player.getLoopVideo) {
    return null
  }

  try {
    const isEnabled = player.getLoopVideo()
    return typeof isEnabled === "boolean" ? isEnabled : null
  } catch {
    return null
  }
}

export function setPlayerLoopVideo(
  player: YouTubePlayerElement,
  enabled: boolean,
): boolean {
  if (!player.setLoopVideo) {
    return false
  }

  try {
    player.setLoopVideo(enabled)
    return true
  } catch {
    return false
  }
}

export function setPlayerPlaybackQuality(
  player: YouTubePlayerElement,
  quality: string,
): boolean {
  let applied = false

  try {
    if (player.setPlaybackQualityRange) {
      player.setPlaybackQualityRange(quality, quality)
      applied = true
    }
  } catch {
    // YouTube can reject a quality range while replacing the active stream.
  }

  try {
    if (player.setPlaybackQuality) {
      player.setPlaybackQuality(quality)
      applied = true
    }
  } catch {
    // Preserve the playback loop when YouTube changes an internal player API.
  }

  return applied
}

export function isAdShowing(documentRef: Document = document): boolean {
  const player = getMoviePlayer(documentRef)

  return Boolean(player && isPlayerShowingAd(player))
}
