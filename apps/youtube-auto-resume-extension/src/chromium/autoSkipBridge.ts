import { SETTINGS_STORAGE_PREFIX } from "../core/settings.ts"
import {
  isTrustedSkipResponse,
  TRUSTED_SKIP_MESSAGE_TYPE,
  type TrustedSkipRequest,
} from "./messages.ts"

const SETTINGS_KEY = `${SETTINGS_STORAGE_PREFIX}settings`
const SCAN_INTERVAL_MS = 250
const SUCCESS_RETRY_DELAY_MS = 1_500
const FAILURE_RETRY_DELAY_MS = 5_000
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

interface UnknownRecord {
  [key: string]: unknown
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isAutoSkipEnabled(): boolean {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null")
    return isRecord(value) && value.autoSkipAds === true
  } catch {
    return false
  }
}

function isInteractionBlocked(element: HTMLElement): boolean {
  let current: HTMLElement | null = element

  while (current) {
    const style = getComputedStyle(current)

    if (
      current.hidden
      || current.inert
      || current.getAttribute("aria-disabled") === "true"
      || current.getAttribute("aria-hidden") === "true"
      || style.display === "none"
      || style.visibility === "hidden"
      || style.visibility === "collapse"
      || (current === element && style.pointerEvents === "none")
      || Number(style.opacity) === 0
    ) {
      return true
    }

    current = current.parentElement
  }

  return false
}

function getVisibleCenter(
  button: HTMLButtonElement,
): { x: number; y: number } | null {
  if (
    !button.isConnected
    || button.disabled
    || isInteractionBlocked(button)
  ) {
    return null
  }

  const rect = button.getBoundingClientRect()
  const x = rect.left + rect.width / 2
  const y = rect.top + rect.height / 2

  if (
    rect.width <= 0
    || rect.height <= 0
    || x < 0
    || y < 0
    || x >= window.innerWidth
    || y >= window.innerHeight
  ) {
    return null
  }

  const hitTarget = document.elementFromPoint(x, y)
  return hitTarget && button.contains(hitTarget) ? { x, y } : null
}

function findVisibleSkipButton(): HTMLButtonElement | null {
  const player = document.querySelector<HTMLElement>("#movie_player")

  if (!player) {
    return null
  }

  const candidates = Array.from(
    player.querySelectorAll<HTMLElement>(SKIP_AD_SELECTOR),
  )

  for (const candidate of candidates) {
    const button = candidate.closest<HTMLButtonElement>("button")

    if (button && player.contains(button) && getVisibleCenter(button)) {
      return button
    }
  }

  return null
}

function isPlaybackEnforcementVisible(): boolean {
  const enforcement = document.querySelector<HTMLElement>(
    PLAYBACK_ENFORCEMENT_SELECTOR,
  )

  if (!enforcement || isInteractionBlocked(enforcement)) {
    return false
  }

  const rect = enforcement.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

let isRequestPending = false
let nextRequestAllowedAt = 0

async function scanForSkipButton(): Promise<void> {
  if (
    isRequestPending
    || Date.now() < nextRequestAllowedAt
    || document.visibilityState !== "visible"
    || !isAutoSkipEnabled()
    || isPlaybackEnforcementVisible()
  ) {
    return
  }

  const button = findVisibleSkipButton()
  const center = button ? getVisibleCenter(button) : null

  if (!center) {
    return
  }

  isRequestPending = true

  try {
    const request: TrustedSkipRequest = {
      type: TRUSTED_SKIP_MESSAGE_TYPE,
      ...center,
    }
    const response = await chrome.runtime.sendMessage(request)
    nextRequestAllowedAt = Date.now() + (
      isTrustedSkipResponse(response) && response.ok
        ? SUCCESS_RETRY_DELAY_MS
        : FAILURE_RETRY_DELAY_MS
    )
  } catch {
    nextRequestAllowedAt = Date.now() + FAILURE_RETRY_DELAY_MS
  } finally {
    isRequestPending = false
  }
}

window.setInterval(() => {
  void scanForSkipButton()
}, SCAN_INTERVAL_MS)

void scanForSkipButton()
