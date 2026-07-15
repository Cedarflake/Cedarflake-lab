import {
  DEFAULT_SETTINGS,
  clampNumber,
  isQualityPreference,
  type Settings,
  type SettingsSaveResult,
} from "../core/settings.ts"
import type { FabAuroraController } from "./fabAurora.ts"
import { applyHostStyles, resolvePanelMountTarget } from "./panelMount.ts"
import { createPanelShell, type PanelElements } from "./panelShell.ts"

export {
  resolvePanelMountTarget,
  type PanelMountDocument,
} from "./panelMount.ts"

const HOST_ID = "auto-chick-yt-auto-resume-host"

export interface PanelViewOptions {
  getSettings: () => Settings
  saveSettings: (settings: Settings) => SettingsSaveResult
  onExpanded?: () => void
  onPanelStatePersistenceFailed?: () => void
  onSettingsApplied?: (result: SettingsSaveResult) => void
  onResumeNow?: () => void
  onSkipNow?: () => void
}

export interface PanelView {
  destroy: () => void
  ensureMounted: () => void
  setStatus: (text: string) => void
  setLastActionText: (text: string) => void
  render: (settings: Settings, lastActionText?: string) => void
  isExpanded: () => boolean
  open: () => void
}

export function createPanelView(options: PanelViewOptions): PanelView {
  const onResumeNow = options.onResumeNow ?? (() => undefined)
  const onSkipNow = options.onSkipNow ?? (() => undefined)
  let host: HTMLDivElement | null = null
  let shadow: ShadowRoot | null = null
  let elements: PanelElements | null = null
  let fabAuroraController: FabAuroraController | null = null
  let mountObserver: MutationObserver | null = null
  let observedMountTarget: Element | null = null
  let statusText = ""
  let currentLastActionText = ""
  let focusReturnTarget: HTMLElement | null = null
  let hasRendered = false
  let isDestroyed = false

  function isExpanded(): boolean {
    if (isDestroyed) {
      return false
    }

    if (!elements) {
      return !options.getSettings().collapsed
    }

    return !elements.panel.classList.contains("hidden")
  }

  function setTextIfChanged(element: Element, text: string): void {
    if (element.textContent !== text) {
      element.textContent = text
    }
  }

  function setCheckedIfChanged(
    input: HTMLInputElement,
    checked: boolean,
  ): void {
    if (input.checked !== checked) {
      input.checked = checked
    }
  }

  function setValueIfChanged(
    input: HTMLInputElement | HTMLSelectElement,
    value: string,
  ): void {
    if (input.value !== value) {
      input.value = value
    }
  }

  function setHiddenIfChanged(element: HTMLElement, isHidden: boolean): void {
    if (element.classList.contains("hidden") !== isHidden) {
      element.classList.toggle("hidden", isHidden)
    }
  }

  function getFocusedElement(): HTMLElement | null {
    const shadowActiveElement = shadow?.activeElement

    if (shadowActiveElement instanceof HTMLElement) {
      return shadowActiveElement
    }

    return document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
  }

  function restoreFocusAfterCollapse(): void {
    const nextFocusTarget = focusReturnTarget
    focusReturnTarget = null

    if (nextFocusTarget?.isConnected && nextFocusTarget !== host) {
      nextFocusTarget.focus()
      return
    }

    elements?.fab.focus()
  }

  function observeMountTarget(target: Element): void {
    if (!mountObserver || observedMountTarget === target) {
      return
    }

    mountObserver.disconnect()
    mountObserver.observe(target, { childList: true })
    observedMountTarget = target
  }

  function moveHostToCurrentTarget(): void {
    if (!host) {
      return
    }

    applyHostStyles(host)

    const target = resolvePanelMountTarget()
    observeMountTarget(target)

    if (host.parentElement === target) {
      return
    }

    target.appendChild(host)
    fabAuroraController?.resetInteraction()
  }

  function watchMountState(): void {
    if (mountObserver) {
      return
    }

    mountObserver = new MutationObserver(() => {
      if (!host) {
        return
      }

      const target = resolvePanelMountTarget()
      if (!host.isConnected || host.parentElement !== target) {
        moveHostToCurrentTarget()
      }
    })
    observeMountTarget(resolvePanelMountTarget())
    document.addEventListener("fullscreenchange", moveHostToCurrentTarget)
  }

  function setOpen(isOpen: boolean): void {
    if (isDestroyed) {
      return
    }

    ensureMounted()

    if (!elements) {
      return
    }

    const wasOpen = isExpanded()

    if (isOpen && !wasOpen) {
      focusReturnTarget = getFocusedElement()
    }

    if (isOpen === wasOpen) {
      if (isOpen) {
        elements?.close.focus()
        options.onExpanded?.()
      }

      return
    }

    const result = options.saveSettings({
      ...options.getSettings(),
      collapsed: !isOpen,
    })
    render(result.settings, currentLastActionText)

    if (!result.persisted) {
      options.onPanelStatePersistenceFailed?.()
    }

    if (isOpen) {
      elements?.close.focus()
      options.onExpanded?.()
      return
    }
  }

  function applySettingsFromUi(): void {
    if (isDestroyed || !elements) {
      return
    }

    const nextSettings: Settings = {
      ...options.getSettings(),
      enabled: elements.enabled.checked,
      intervalMs: Math.round(
        clampNumber(
          elements.interval.value,
          200,
          10_000,
          DEFAULT_SETTINGS.intervalMs,
        ),
      ),
      minPausedSeconds: clampNumber(
        elements.minPaused.value,
        0,
        30,
        DEFAULT_SETTINGS.minPausedSeconds,
      ),
      autoSkipAds: elements.autoSkipAds.checked,
      preferredQuality: isQualityPreference(elements.preferredQuality.value)
        ? elements.preferredQuality.value
        : DEFAULT_SETTINGS.preferredQuality,
      avoidTyping: elements.avoidTyping.checked,
      avoidEnded: elements.avoidEnded.checked,
    }
    const result = options.saveSettings(nextSettings)
    setValueIfChanged(elements.interval, String(result.settings.intervalMs))
    setValueIfChanged(
      elements.minPaused,
      String(result.settings.minPausedSeconds),
    )

    if (options.onSettingsApplied) {
      options.onSettingsApplied(result)
      return
    }

    render(result.settings, currentLastActionText)
  }

  function buildPanel(): void {
    if (isDestroyed) {
      return
    }

    host = document.createElement("div")
    host.id = HOST_ID
    host.setAttribute("data-auto-chick-ui", "youtube-auto-resume")
    applyHostStyles(host)

    const panelShell = createPanelShell(host, {
      statusText,
      lastActionText: currentLastActionText,
    })
    shadow = panelShell.shadow
    elements = panelShell.elements
    fabAuroraController = panelShell.fabAuroraController

    elements.fab.addEventListener("click", () => setOpen(true))
    elements.close.addEventListener("click", () => setOpen(false))
    elements.enabled.addEventListener("change", applySettingsFromUi)
    elements.interval.addEventListener("change", applySettingsFromUi)
    elements.minPaused.addEventListener("change", applySettingsFromUi)
    elements.autoSkipAds.addEventListener("change", applySettingsFromUi)
    elements.preferredQuality.addEventListener("change", applySettingsFromUi)
    elements.avoidTyping.addEventListener("change", applySettingsFromUi)
    elements.avoidEnded.addEventListener("change", applySettingsFromUi)
    elements.resumeNow.addEventListener("click", onResumeNow)
    elements.skipNow.addEventListener("click", onSkipNow)
    elements.panel.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !isExpanded()) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    })

    render(options.getSettings(), currentLastActionText)
  }

  function ensureMounted(): void {
    if (isDestroyed) {
      return
    }

    if (!host) {
      buildPanel()
      watchMountState()
    }

    moveHostToCurrentTarget()
  }

  function setStatus(text: string): void {
    if (isDestroyed) {
      return
    }

    statusText = text
    ensureMounted()

    if (elements) {
      setTextIfChanged(elements.status, statusText)
    }
  }

  function setLastActionText(text: string): void {
    if (isDestroyed) {
      return
    }

    currentLastActionText = text
    ensureMounted()

    if (elements) {
      setTextIfChanged(elements.lastAction, currentLastActionText)
    }
  }

  function render(
    settings: Settings,
    nextLastActionText?: string,
  ): void {
    if (isDestroyed) {
      return
    }

    ensureMounted()

    if (!elements) {
      return
    }

    if (typeof nextLastActionText === "string") {
      currentLastActionText = nextLastActionText
    }

    const wasOpen = hasRendered && isExpanded()
    const isOpen = !settings.collapsed
    setHiddenIfChanged(elements.panel, !isOpen)
    setHiddenIfChanged(elements.fab, isOpen)
    fabAuroraController?.setVisible(!isOpen)
    setCheckedIfChanged(elements.enabled, settings.enabled)

    if (shadow?.activeElement !== elements.interval) {
      setValueIfChanged(elements.interval, String(settings.intervalMs))
    }

    if (shadow?.activeElement !== elements.minPaused) {
      setValueIfChanged(elements.minPaused, String(settings.minPausedSeconds))
    }

    setCheckedIfChanged(elements.autoSkipAds, settings.autoSkipAds)
    setValueIfChanged(elements.preferredQuality, settings.preferredQuality)
    setCheckedIfChanged(elements.avoidTyping, settings.avoidTyping)
    setCheckedIfChanged(elements.avoidEnded, settings.avoidEnded)
    setTextIfChanged(elements.status, statusText)
    setTextIfChanged(elements.lastAction, currentLastActionText)

    if (wasOpen && !isOpen) {
      restoreFocusAfterCollapse()
    }

    hasRendered = true
  }

  function open(): void {
    if (isDestroyed) {
      return
    }

    setOpen(true)
  }

  function destroy(): void {
    if (isDestroyed) {
      return
    }

    isDestroyed = true
    fabAuroraController?.destroy()
    fabAuroraController = null
    mountObserver?.disconnect()
    mountObserver = null
    observedMountTarget = null
    document.removeEventListener("fullscreenchange", moveHostToCurrentTarget)
    host?.remove()
    host = null
    shadow = null
    elements = null
    focusReturnTarget = null
    hasRendered = false
  }

  return {
    destroy,
    ensureMounted,
    setStatus,
    setLastActionText,
    render,
    isExpanded,
    open,
  }
}
