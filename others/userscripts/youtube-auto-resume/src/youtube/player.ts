export interface YouTubePlayerElement extends HTMLElement {
  getAvailableQualityLevels?: () => unknown
  getPlaybackQuality?: () => unknown
  setPlaybackQuality?: (quality: string) => void
  setPlaybackQualityRange?: (minimum: string, maximum: string) => void
}

export function getVideo(documentRef: Document = document): HTMLVideoElement | null {
  return documentRef.querySelector<HTMLVideoElement>(
    "ytd-player video, video.html5-main-video, video",
  )
}

export function getMoviePlayer(
  documentRef: Document = document,
): YouTubePlayerElement | null {
  const element =
    documentRef.getElementById("movie_player") ??
    documentRef.querySelector<HTMLElement>(".html5-video-player")

  return element as YouTubePlayerElement | null
}

export function isAdShowing(documentRef: Document = document): boolean {
  const player = getMoviePlayer(documentRef)

  return Boolean(
    player &&
      (player.classList.contains("ad-showing") ||
        player.classList.contains("ad-interrupting")),
  )
}

export function getPlaybackQuality(
  documentRef: Document = document,
): string | null {
  const player = getMoviePlayer(documentRef)

  if (!player?.getPlaybackQuality) {
    return null
  }

  try {
    const quality = player.getPlaybackQuality()
    return typeof quality === "string" ? quality : null
  } catch {
    return null
  }
}

export function getAvailableQualityLevels(
  documentRef: Document = document,
): string[] | null {
  const player = getMoviePlayer(documentRef)

  if (!player?.getAvailableQualityLevels) {
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

export function setPlaybackQuality(
  quality: string,
  documentRef: Document = document,
): void {
  const player = getMoviePlayer(documentRef)

  if (!player) {
    return
  }

  try {
    player.setPlaybackQualityRange?.(quality, quality)
  } catch {
    // YouTube may temporarily reject quality changes while the player reloads.
  }

  try {
    player.setPlaybackQuality?.(quality)
  } catch {
    // Keep the playback loop alive when an internal player API changes.
  }
}
