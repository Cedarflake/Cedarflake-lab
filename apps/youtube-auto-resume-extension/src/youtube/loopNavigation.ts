import { isTypingContext } from "../core/typing.ts"

import { isSkipAdControl } from "./ads.ts"
import { getWatchVideoId } from "./loopTarget.ts"

interface LoopNavigationTracker {
  start: () => void
  stop: () => void
}

interface LoopNavigationTrackerOptions {
  getEnabled: () => boolean
  onNavigationCheck: () => void
  onUserNavigation: (videoId: string | null) => void
}

export function createLoopNavigationTracker(
  options: LoopNavigationTrackerOptions,
): LoopNavigationTracker {
  let isStarted = false

  function handleDocumentClick(event: MouseEvent): void {
    if (
      !options.getEnabled()
      || !event.isTrusted
      || event.button !== 0
      || event.altKey
      || event.ctrlKey
      || event.metaKey
      || event.shiftKey
    ) {
      return
    }

    const eventPath = event.composedPath()
    const navigationButton = eventPath.find(
      (target): target is Element => (
        target instanceof Element
        && target.matches(".ytp-next-button, .ytp-prev-button")
      ),
    )

    if (navigationButton) {
      options.onUserNavigation(null)
      return
    }

    const anchor = eventPath.find(
      (target): target is HTMLAnchorElement => (
        target instanceof HTMLAnchorElement
      ),
    )

    if (
      anchor
      && (
        anchor.hasAttribute("download")
        || (anchor.target && anchor.target !== "_self")
      )
    ) {
      return
    }

    const videoId = anchor ? getWatchVideoId(anchor.href) : null

    if (videoId) {
      options.onUserNavigation(videoId)
      return
    }

    const isIgnoredGenericInteraction = eventPath.some(
      (target) => target instanceof Element && (
        isSkipAdControl(target)
        || target.matches(
          "#auto-chick-yt-auto-resume-host, input, textarea, select, "
          + "[contenteditable=\"true\"]",
        )
      ),
    )

    if (!isIgnoredGenericInteraction) {
      options.onUserNavigation(null)
    }
  }

  function handleDocumentKeydown(event: KeyboardEvent): void {
    const isYouTubeVideoShortcut = event.shiftKey
      && (event.code === "KeyN" || event.code === "KeyP")
    const isMediaVideoShortcut = event.key === "MediaTrackNext"
      || event.key === "MediaTrackPrevious"

    if (!options.getEnabled() || !event.isTrusted) {
      return
    }

    if (
      !isTypingContext()
      && (isYouTubeVideoShortcut || isMediaVideoShortcut)
    ) {
      options.onUserNavigation(null)
      return
    }

    if (event.key !== "Enter" || isTypingContext()) {
      return
    }

    const eventPath = event.composedPath()
    const isIgnoredGenericInteraction = eventPath.some(
      (target) => target instanceof Element && (
        isSkipAdControl(target)
        || target.matches("#auto-chick-yt-auto-resume-host")
      ),
    )

    if (isIgnoredGenericInteraction) {
      return
    }

    const anchor = eventPath.find(
      (target): target is HTMLAnchorElement => (
        target instanceof HTMLAnchorElement
      ),
    )
    const videoId = anchor ? getWatchVideoId(anchor.href) : null

    options.onUserNavigation(videoId)
  }

  function handlePopState(event: PopStateEvent): void {
    if (options.getEnabled() && event.isTrusted) {
      options.onUserNavigation(getWatchVideoId(window.location.href))
    }

    options.onNavigationCheck()
  }

  function start(): void {
    if (isStarted) {
      return
    }

    isStarted = true
    document.addEventListener("click", handleDocumentClick, true)
    document.addEventListener("keydown", handleDocumentKeydown, true)
    window.addEventListener("popstate", handlePopState)
  }

  function stop(): void {
    if (!isStarted) {
      return
    }

    isStarted = false
    document.removeEventListener("click", handleDocumentClick, true)
    document.removeEventListener("keydown", handleDocumentKeydown, true)
    window.removeEventListener("popstate", handlePopState)
  }

  return {
    start,
    stop,
  }
}
