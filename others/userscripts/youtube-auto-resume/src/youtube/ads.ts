import {
  DEFAULT_SETTINGS,
  type YouTubeAutoResumeSettings,
} from "../core/settings.ts"
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
const DEFAULT_COOLDOWN_MS = 750
const DEFAULT_SAME_CONTROL_RETRY_MS = 1_500

export interface AdUiSnapshot {
  canSkipAd: boolean
}

export interface AdSkipperOptions {
  getSettings?: () => Pick<YouTubeAutoResumeSettings, "autoSkipAds">
  getPlayerContext?: YouTubePlayerContextResolver
  onAction?: (message: string) => void
  document?: Document
  cooldownMs?: number
  sameControlRetryMs?: number
  now?: () => number
}

export interface AdUiSnapshotOptions {
  getPlayerContext?: YouTubePlayerContextResolver
  document?: Document
}

export interface AdSkipAttemptOptions {
  force?: boolean
}

export interface AdSkipResult {
  acted: boolean
}

export interface AdSkipper {
  trySkipAdsIfPossible(options?: AdSkipAttemptOptions): AdSkipResult
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
): HTMLElement | null {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(selector))

  for (const candidate of elements) {
    const closestControl = candidate.closest<HTMLElement>(
      "button, [role=\"button\"]",
    )
    const element = closestControl && root.contains(closestControl)
      ? closestControl
      : candidate

    if (
      typeof element.click === "function"
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
): HTMLElement | null {
  return findInteractiveElement(player, SKIP_AD_SELECTOR)
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

export function createAdSkipper(options: AdSkipperOptions = {}): AdSkipper {
  const getSettings = options.getSettings
    ?? (() => ({ autoSkipAds: DEFAULT_SETTINGS.autoSkipAds }))
  const onAction = options.onAction ?? (() => undefined)
  const getPlayerContext = options.getPlayerContext
    ?? (() => resolveActivePlayerContext(options.document ?? document))
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS
  const sameControlRetryMs = Math.max(
    cooldownMs,
    options.sameControlRetryMs ?? DEFAULT_SAME_CONTROL_RETRY_MS,
  )
  const getNow = options.now ?? Date.now
  let lastAutomaticallyClickedControl: HTMLElement | null = null
  let lastAdActionAt = Number.NEGATIVE_INFINITY

  function createResult(acted: boolean): AdSkipResult {
    return { acted }
  }

  function clickControl(
    control: HTMLElement,
    force: boolean,
    currentTime: number,
    message: string,
  ): AdSkipResult {
    if (
      !force
      && lastAutomaticallyClickedControl === control
      && currentTime - lastAdActionAt < sameControlRetryMs
    ) {
      return createResult(false)
    }

    control.click()
    lastAutomaticallyClickedControl = control
    lastAdActionAt = currentTime
    onAction(message)
    return createResult(true)
  }

  function trySkipAdsIfPossible(
    attemptOptions: AdSkipAttemptOptions = {},
  ): AdSkipResult {
    const force = attemptOptions.force === true

    if (!getSettings().autoSkipAds && !force) {
      lastAutomaticallyClickedControl = null
      return createResult(false)
    }

    const currentTime = getNow()

    if (!force && currentTime - lastAdActionAt < cooldownMs) {
      return createResult(false)
    }

    const context = getPlayerContext()

    if (!context) {
      lastAutomaticallyClickedControl = null

      if (force) {
        onAction("手动跳过：未找到 YouTube 提供的广告控件")
      }

      return createResult(false)
    }

    const skipButton = findSkipAdButton(context.player)

    if (skipButton) {
      return clickControl(
        skipButton,
        force,
        currentTime,
        "检测到 YouTube 跳过按钮，已点击",
      )
    }

    if (force) {
      onAction("手动跳过：当前广告没有可用的官方跳过按钮")
    }

    lastAutomaticallyClickedControl = null
    return createResult(false)
  }

  return { trySkipAdsIfPossible }
}
