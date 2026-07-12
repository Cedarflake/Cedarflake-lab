import {
  DEFAULT_SETTINGS,
  type YouTubeAutoResumeSettings,
} from "../core/settings.ts"

const SKIP_AD_SELECTOR = [
  ".ytp-ad-skip-button-modern",
  ".ytp-ad-skip-button",
  ".ytp-ad-skip-button-slot button",
  ".ytp-skip-ad-button",
  ".videoAdUiSkipButton",
  ".ytp-ad-text.ytp-ad-skip-button-text",
  "button[class*=\"skip-ad\"]",
].join(", ")

const AD_OVERLAY_CLOSE_SELECTOR = [
  ".ytp-ad-overlay-close-button",
  "button[class*=\"overlay-close\"]",
].join(", ")

export interface AdUiSnapshot {
  canSkipAd: boolean
  canCloseAdOverlay: boolean
}

export interface AdSkipperOptions {
  getSettings?: () => Pick<YouTubeAutoResumeSettings, "autoSkipAds">
  onAction?: (message: string) => void
  document?: Document
  cooldownMs?: number
  now?: () => number
}

export interface AdSkipAttemptOptions {
  force?: boolean
}

export interface AdSkipper {
  trySkipAdsIfPossible(options?: AdSkipAttemptOptions): boolean
}

export function findSkipAdButton(
  documentRef: Document = document,
): HTMLElement | null {
  return documentRef.querySelector<HTMLElement>(SKIP_AD_SELECTOR)
}

export function findAdOverlayCloseButton(
  documentRef: Document = document,
): HTMLElement | null {
  return documentRef.querySelector<HTMLElement>(AD_OVERLAY_CLOSE_SELECTOR)
}

export function isElementVisible(element: Element | null): boolean {
  if (!element) {
    return false
  }

  const view = element.ownerDocument.defaultView

  if (!view) {
    return false
  }

  const style = view.getComputedStyle(element)

  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number(style.opacity) === 0
  ) {
    return false
  }

  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

export function getAdUiSnapshot(documentRef: Document = document): AdUiSnapshot {
  return {
    canSkipAd: isElementVisible(findSkipAdButton(documentRef)),
    canCloseAdOverlay: isElementVisible(
      findAdOverlayCloseButton(documentRef),
    ),
  }
}

export function createAdSkipper(options: AdSkipperOptions = {}): AdSkipper {
  const getSettings =
    options.getSettings ??
    (() => ({ autoSkipAds: DEFAULT_SETTINGS.autoSkipAds }))
  const onAction = options.onAction ?? (() => undefined)
  const documentRef = options.document ?? document
  const cooldownMs = options.cooldownMs ?? 1200
  const getNow = options.now ?? Date.now
  let lastAdClickAt = Number.NEGATIVE_INFINITY

  function trySkipAdsIfPossible(
    attemptOptions: AdSkipAttemptOptions = {},
  ): boolean {
    const force = Boolean(attemptOptions.force)
    const settings = getSettings()

    if (!settings.autoSkipAds && !force) {
      return false
    }

    const currentTime = getNow()

    if (currentTime - lastAdClickAt < cooldownMs) {
      return false
    }

    let acted = false
    const skipButton = findSkipAdButton(documentRef)

    if (skipButton && isElementVisible(skipButton)) {
      skipButton.click()
      acted = true
      onAction("检测到可跳过广告，已点击“跳过”")
    }

    if (!acted) {
      const overlayCloseButton = findAdOverlayCloseButton(documentRef)

      if (overlayCloseButton && isElementVisible(overlayCloseButton)) {
        overlayCloseButton.click()
        acted = true
        onAction("检测到广告遮罩，已点击关闭")
      }
    }

    if (acted) {
      lastAdClickAt = currentTime
      return true
    }

    if (force) {
      onAction("手动跳过：未检测到正在播放的广告")
    }

    return false
  }

  return { trySkipAdsIfPossible }
}
