import {
  isTrustedSkipRequest,
  type TrustedSkipResponse,
} from "./messages.ts"

const DEBUGGER_PROTOCOL_VERSION = "1.3"
const activeTabs = new Set<number>()

function isYouTubePage(url: string | undefined): boolean {
  if (!url) {
    return false
  }

  try {
    const parsedUrl = new URL(url)
    return (
      parsedUrl.protocol === "https:"
      && parsedUrl.hostname === "www.youtube.com"
    )
  } catch {
    return false
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Trusted input failed"
}

async function dispatchTrustedClick(
  tabId: number,
  x: number,
  y: number,
): Promise<void> {
  const target = { tabId }
  let isAttached = false

  try {
    await chrome.debugger.attach(target, DEBUGGER_PROTOCOL_VERSION)
    isAttached = true
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
    })
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      clickCount: 1,
      type: "mousePressed",
      x,
      y,
    })
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      button: "left",
      buttons: 0,
      clickCount: 1,
      type: "mouseReleased",
      x,
      y,
    })
  } finally {
    if (isAttached) {
      await chrome.debugger.detach(target).catch(() => undefined)
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    !isTrustedSkipRequest(message)
    || sender.id !== chrome.runtime.id
    || !isYouTubePage(sender.url)
  ) {
    return
  }

  const tabId = sender.tab?.id

  if (typeof tabId !== "number") {
    sendResponse({ ok: false, error: "Missing sender tab" })
    return
  }

  if (activeTabs.has(tabId)) {
    sendResponse({ ok: false, error: "Trusted input already active" })
    return
  }

  activeTabs.add(tabId)
  void dispatchTrustedClick(tabId, message.x, message.y)
    .then(() => {
      sendResponse({ ok: true } satisfies TrustedSkipResponse)
    })
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        error: getErrorMessage(error),
      } satisfies TrustedSkipResponse)
    })
    .finally(() => {
      activeTabs.delete(tabId)
    })

  return true
})
