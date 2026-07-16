import {
  resolveActivePlayerContext,
  type YouTubePlayerContextResolver,
  type YouTubePlayerElement,
} from "./player.ts"

const SKIP_AD_SELECTOR = [
  ".ytp-ad-skip-button-modern",
  ".ytp-ad-skip-button",
  ".ytp-ad-skip-button-slot button",
  ".ytp-skip-ad-button",
  ".videoAdUiSkipButton",
  ".ytp-ad-text.ytp-ad-skip-button-text",
].join(", ")

const PLAYBACK_ENFORCEMENT_SELECTOR =
  "#error-screen ytd-enforcement-message-view-model[in-player]"

export interface AdUiSnapshot {
  canSkipAd: boolean
}

export interface AdUiSnapshotOptions {
  getPlayerContext?: YouTubePlayerContextResolver
  document?: Document
}

function isDisabled(element: HTMLElement): boolean {
  return (
    element.getAttribute("aria-disabled") === "true"
    || ("disabled" in element && Boolean(element.disabled))
  )
}

function hasInteractionBlocker(element: Element): boolean {
  const view = element.ownerDocument.defaultView

  if (!view) {
    return true
  }

  if (view.getComputedStyle(element).pointerEvents === "none") {
    return true
  }

  let current: Element | null = element

  while (current) {
    const style = view.getComputedStyle(current)

    if (
      current.hasAttribute("hidden")
      || current.hasAttribute("inert")
      || current.getAttribute("aria-disabled") === "true"
      || current.getAttribute("aria-hidden") === "true"
      || ("disabled" in current && Boolean(current.disabled))
      || style.display === "none"
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

function findInteractiveElement(
  root: YouTubePlayerElement,
  selector: string,
): HTMLButtonElement | null {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(selector))

  for (const candidate of elements) {
    const element = candidate.closest<HTMLButtonElement>("button")

    if (
      element
      && root.contains(element)
      && !isDisabled(element)
      && isElementVisible(element)
    ) {
      return element
    }
  }

  return null
}

export function findSkipAdButton(
  player: YouTubePlayerElement,
): HTMLButtonElement | null {
  return findInteractiveElement(player, SKIP_AD_SELECTOR)
}

export function isSkipAdControl(element: Element): boolean {
  return element.matches(SKIP_AD_SELECTOR)
}

export function isElementVisible(element: Element | null): boolean {
  if (!element) {
    return false
  }

  if (!element.isConnected || hasInteractionBlocker(element)) {
    return false
  }

  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

export function isPlaybackEnforcementVisible(
  documentRef: Document = document,
): boolean {
  return isElementVisible(
    documentRef.querySelector(PLAYBACK_ENFORCEMENT_SELECTOR),
  )
}

export function getAdUiSnapshot(
  options: AdUiSnapshotOptions = {},
): AdUiSnapshot {
  const context = (
    options.getPlayerContext
    ?? (() => resolveActivePlayerContext(options.document ?? document))
  )()

  if (!context) {
    return {
      canSkipAd: false,
    }
  }

  return {
    canSkipAd: findSkipAdButton(context.player) !== null,
  }
}
