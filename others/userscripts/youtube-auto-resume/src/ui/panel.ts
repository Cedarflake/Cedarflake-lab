import {
  DEFAULT_SETTINGS,
  clampNumber,
  type Settings,
  type SettingsSaveResult,
} from "../core/settings.ts"
import { mountFabAurora, type FabAuroraController } from "./fabAurora.ts"
import { createIcon } from "./icons.ts"

const HOST_ID = "auto-chick-yt-auto-resume-host"

const PANEL_CSS = `
  :host {
    all: initial;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  button,
  input {
    font: inherit;
  }

  .wrap {
    display: block;
    width: max-content;
    max-width: calc(
      100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)
    );
    color: #f1f1f1;
    font-family: "Roboto", "Arial", sans-serif;
    line-height: normal;
  }

  .hidden {
    display: none !important;
  }

  .fab {
    position: relative;
    isolation: isolate;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    overflow: visible;
    padding: 0;
    border: 0;
    border-radius: 50%;
    outline: none;
    background: transparent;
    color: #ff0000;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.2s;
  }

  .fab-aurora {
    --ytar-fab-aurora-blur: 4px;
    --ytar-fab-aurora-inset: -1px;
    --ytar-fab-aurora-scale-x: 1;
    --ytar-fab-aurora-scale-y: 1;
    --ytar-fab-aurora-gradient: conic-gradient(
      #3186ff 34%,
      #9378ff 37%,
      #f96bd6 39%,
      #fc413d 41%,
      #fc413d 48%,
      #ff6b2b 50%,
      #fec700 52%,
      #ffdb0f 56%,
      #88de42 58%,
      #0ebc5f 61%,
      #0ebc5f 65%,
      #2eaab2 70%,
      #00a9bb 72%,
      #3186ff 73%,
      #3186ff 83%,
      #3186ff 100%
    );

    position: absolute;
    inset: 0;
    z-index: 0;
    display: block;
    overflow: visible;
    border-radius: 50%;
    pointer-events: none;
  }

  .fab-aurora-motion {
    --ytar-fab-aurora-focus: 0;
    --ytar-fab-aurora-mask-angle: 0deg;
    --ytar-fab-aurora-gradient-angle: 0deg;
    --ytar-fab-aurora-soft-fade-start: 0%;
    --ytar-fab-aurora-soft-solid-start: 0%;
    --ytar-fab-aurora-soft-solid-end: 100%;
    --ytar-fab-aurora-soft-fade-end: 100%;
    --ytar-fab-aurora-sharp-fade-start: 0%;
    --ytar-fab-aurora-sharp-solid-start: 0%;
    --ytar-fab-aurora-sharp-solid-end: 100%;
    --ytar-fab-aurora-sharp-fade-end: 100%;

    position: absolute;
    inset: 0;
    z-index: 1;
    display: block;
    border-radius: inherit;
    opacity: 0;
    will-change:
      --ytar-fab-aurora-mask-angle,
      --ytar-fab-aurora-gradient-angle,
      opacity;
  }

  .fab-aurora-stack,
  .fab-aurora-clip,
  .fab-aurora-mask,
  .fab-aurora-gradient {
    position: absolute;
    display: block;
    border-radius: inherit;
  }

  .fab-aurora-stack,
  .fab-aurora-mask,
  .fab-aurora-gradient {
    inset: 0;
  }

  .fab-aurora-clip {
    inset: var(--ytar-fab-aurora-inset);
    overflow: hidden;
    backface-visibility: hidden;
    filter: blur(var(--ytar-fab-aurora-blur));
    opacity: calc(0.55 + var(--ytar-fab-aurora-focus) * 0.45);
    transform: translateZ(0);
  }

  .fab-aurora-clip-sharp {
    filter: blur(1px);
    opacity: calc(0.9 + var(--ytar-fab-aurora-focus) * 0.1);
  }

  .fab-aurora-mask {
    scale:
      var(--ytar-fab-aurora-scale-x)
      var(--ytar-fab-aurora-scale-y);
    -webkit-mask-image:
      conic-gradient(
        from var(--ytar-fab-aurora-mask-angle),
        transparent 0,
        transparent var(--ytar-fab-aurora-soft-fade-start),
        black var(--ytar-fab-aurora-soft-solid-start),
        black var(--ytar-fab-aurora-soft-solid-end),
        transparent var(--ytar-fab-aurora-soft-fade-end),
        transparent 100%
      );
    mask-image:
      conic-gradient(
        from var(--ytar-fab-aurora-mask-angle),
        transparent 0,
        transparent var(--ytar-fab-aurora-soft-fade-start),
        black var(--ytar-fab-aurora-soft-solid-start),
        black var(--ytar-fab-aurora-soft-solid-end),
        transparent var(--ytar-fab-aurora-soft-fade-end),
        transparent 100%
      );
  }

  .fab-aurora-clip-sharp .fab-aurora-mask {
    -webkit-mask-image:
      conic-gradient(
        from var(--ytar-fab-aurora-mask-angle),
        transparent 0,
        transparent var(--ytar-fab-aurora-sharp-fade-start),
        black var(--ytar-fab-aurora-sharp-solid-start),
        black var(--ytar-fab-aurora-sharp-solid-end),
        transparent var(--ytar-fab-aurora-sharp-fade-end),
        transparent 100%
      );
    mask-image:
      conic-gradient(
        from var(--ytar-fab-aurora-mask-angle),
        transparent 0,
        transparent var(--ytar-fab-aurora-sharp-fade-start),
        black var(--ytar-fab-aurora-sharp-solid-start),
        black var(--ytar-fab-aurora-sharp-solid-end),
        transparent var(--ytar-fab-aurora-sharp-fade-end),
        transparent 100%
      );
  }

  .fab-aurora-gradient {
    rotate: var(--ytar-fab-aurora-gradient-angle);
    backface-visibility: hidden;
    background: var(--ytar-fab-aurora-gradient);
    transform: translateZ(0);
  }

  .fab-surface {
    position: absolute;
    inset: 1px;
    z-index: 1;
    display: block;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    background: rgba(33, 33, 33, 0.96);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
    clip-path: circle(50%);
    pointer-events: none;
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    transition: background-color 0.2s, filter 0.2s;
  }

  .fab-surface::after {
    position: absolute;
    inset: -10px;
    border-radius: inherit;
    background: inherit;
    opacity: 0.5;
    content: "";
  }

  .fab:hover .fab-surface {
    background: rgba(48, 48, 48, 0.98);
    filter: blur(2px);
  }

  .fab-content {
    position: relative;
    z-index: 2;
    display: inline-flex;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .fab:active {
    transform: scale(0.95);
  }

  .fab:focus-visible,
  .icon-button:focus-visible,
  .button:focus-visible,
  .number-input:focus-visible {
    outline: 2px solid #3ea6ff;
    outline-offset: 2px;
  }

  .switch input:focus-visible + .track {
    outline: 2px solid #3ea6ff;
    outline-offset: 3px;
  }

  .fab-content svg {
    width: 24px;
    height: 24px;
  }

  .panel {
    width: 340px;
    max-width: calc(
      100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)
    );
    max-height: calc(100vh - 32px);
    max-height: calc(
      100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)
    );
    overflow: hidden auto;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    background: #212121;
    box-shadow: 0 16px 32px rgba(0, 0, 0, 0.5);
    color: #f1f1f1;
    transform-origin: bottom right;
  }

  .header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 8px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: inherit;
  }

  .title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 500;
  }

  .badge {
    display: inline-flex;
    color: #ff0000;
  }

  .badge svg {
    width: 20px;
    height: 20px;
  }

  .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    outline: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .icon-button:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .icon-button:active {
    background: rgba(255, 255, 255, 0.2);
  }

  .icon-button svg {
    width: 20px;
    height: 20px;
  }

  .content {
    padding: 12px 16px 16px;
  }

  .grid {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .label {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 4px;
    cursor: pointer;
  }

  .label-key {
    font-size: 14px;
    font-weight: 400;
  }

  .label-description {
    color: #aaaaaa;
    font-size: 12px;
  }

  .number-input {
    width: 80px;
    flex: 0 0 auto;
    padding: 6px 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    outline: none;
    background: rgba(0, 0, 0, 0.2);
    color: inherit;
    font-size: 13px;
    text-align: center;
    transition: border-color 0.2s;
  }

  .number-input:focus {
    border-color: #3ea6ff;
  }

  .switch {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    margin-right: 2px;
    cursor: pointer;
  }

  .switch input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .track {
    display: inline-flex;
    width: 36px;
    height: 14px;
    align-items: center;
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.2);
    transition: background-color 0.2s;
  }

  .thumb {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #aaaaaa;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
    transform: translateX(-2px);
    transition: background-color 0.2s, transform 0.2s;
  }

  input:checked + .track {
    background: rgba(62, 166, 255, 0.3);
  }

  input:checked + .track .thumb {
    background: #3ea6ff;
    transform: translateX(18px);
  }

  .status {
    margin-top: 16px;
    padding: 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    color: #aaaaaa;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-line;
  }

  .last-action {
    margin-top: 8px;
    color: #aaaaaa;
    font-size: 12px;
    text-align: center;
  }

  .footer {
    display: flex;
    gap: 8px;
    margin-top: 16px;
  }

  .button {
    display: inline-flex;
    min-width: 0;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    border: 0;
    border-radius: 18px;
    outline: none;
    background: rgba(255, 255, 255, 0.1);
    color: #f1f1f1;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .button:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .button:active {
    background: rgba(255, 255, 255, 0.3);
  }

  .button-primary {
    background: #f1f1f1;
    color: #0f0f0f;
  }

  .button-primary:hover {
    background: #d9d9d9;
  }

  .button svg {
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
  }

  .fade-in {
    animation: fade-in 0.2s cubic-bezier(0.05, 0, 0, 1);
  }

  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-color-scheme: light) {
    .wrap {
      color: #0f0f0f;
    }

    .fab-surface {
      border-color: rgba(0, 0, 0, 0.1);
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .fab:hover .fab-surface {
      background: rgba(240, 240, 240, 0.98);
    }

    .fab:focus-visible,
    .icon-button:focus-visible,
    .button:focus-visible,
    .number-input:focus-visible,
    .switch input:focus-visible + .track {
      outline-color: #065fd4;
    }

    .panel {
      border-color: rgba(0, 0, 0, 0.1);
      background: #ffffff;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
      color: #0f0f0f;
    }

    .header {
      border-bottom-color: rgba(0, 0, 0, 0.1);
    }

    .icon-button:hover {
      background: rgba(0, 0, 0, 0.05);
    }

    .label-description,
    .last-action {
      color: #606060;
    }

    .number-input {
      border-color: rgba(0, 0, 0, 0.1);
      background: #ffffff;
    }

    .track {
      background: rgba(0, 0, 0, 0.1);
    }

    .thumb {
      background: #606060;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }

    input:checked + .track {
      background: rgba(6, 95, 212, 0.2);
    }

    input:checked + .track .thumb {
      background: #065fd4;
    }

    .status {
      background: rgba(0, 0, 0, 0.03);
      color: #606060;
    }

    .button {
      background: rgba(0, 0, 0, 0.05);
      color: #0f0f0f;
    }

    .button:hover {
      background: rgba(0, 0, 0, 0.1);
    }

    .button-primary {
      background: #0f0f0f;
      color: #ffffff;
    }

    .button-primary:hover {
      background: #272727;
    }
  }

  @media (max-width: 420px) {
    .footer {
      flex-direction: column;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fab,
    .fab-surface,
    .icon-button,
    .number-input,
    .track,
    .thumb,
    .button {
      transition: none;
    }

    .fade-in {
      animation: none;
    }

    .fab-aurora-motion {
      will-change: auto;
    }
  }

  @media (forced-colors: active) {
    .fab-aurora {
      display: none;
    }

    .fab-surface {
      border-color: ButtonText;
      background: ButtonFace;
      box-shadow: none;
      filter: none;
    }

    .fab-content {
      color: ButtonText;
    }
  }
`

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

interface PanelElements {
  fab: HTMLButtonElement
  panel: HTMLDivElement
  close: HTMLButtonElement
  enabled: HTMLInputElement
  interval: HTMLInputElement
  minPaused: HTMLInputElement
  autoSkipAds: HTMLInputElement
  avoidTyping: HTMLInputElement
  avoidEnded: HTMLInputElement
  status: HTMLDivElement
  lastAction: HTMLDivElement
}

interface SwitchRow {
  row: HTMLDivElement
  input: HTMLInputElement
}

interface NumberRow {
  row: HTMLDivElement
  input: HTMLInputElement
}

function createLabel(
  id: string,
  title: string,
  description: string,
): HTMLLabelElement {
  const label = document.createElement("label")
  const key = document.createElement("div")
  const detail = document.createElement("div")

  label.className = "label"
  label.htmlFor = id
  key.className = "label-key"
  key.id = `${id}-label`
  key.textContent = title
  detail.className = "label-description"
  detail.id = `${id}-description`
  detail.textContent = description
  label.append(key, detail)

  return label
}

function createSwitchRow(
  id: string,
  title: string,
  description: string,
): SwitchRow {
  const row = document.createElement("div")
  const control = document.createElement("label")
  const input = document.createElement("input")
  const track = document.createElement("span")
  const thumb = document.createElement("span")

  row.className = "row"
  control.className = "switch"
  input.id = id
  input.type = "checkbox"
  input.setAttribute("aria-labelledby", `${id}-label`)
  input.setAttribute("aria-describedby", `${id}-description`)
  track.className = "track"
  thumb.className = "thumb"
  track.appendChild(thumb)
  control.append(input, track)
  row.append(createLabel(id, title, description), control)

  return { row, input }
}

function createNumberRow(
  id: string,
  title: string,
  description: string,
  min: number,
  max: number,
  step: number,
): NumberRow {
  const row = document.createElement("div")
  const input = document.createElement("input")

  row.className = "row"
  input.id = id
  input.className = "number-input"
  input.type = "number"
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  input.setAttribute("aria-labelledby", `${id}-label`)
  input.setAttribute("aria-describedby", `${id}-description`)
  row.append(createLabel(id, title, description), input)

  return { row, input }
}

function applyHostStyles(host: HTMLDivElement): void {
  const styles: ReadonlyArray<readonly [string, string]> = [
    ["position", "fixed"],
    ["right", "calc(16px + env(safe-area-inset-right, 0px))"],
    ["bottom", "calc(16px + env(safe-area-inset-bottom, 0px))"],
    ["left", "auto"],
    ["top", "auto"],
    ["z-index", "2147483647"],
    ["display", "block"],
    ["visibility", "visible"],
    ["opacity", "1"],
    ["width", "max-content"],
    ["height", "max-content"],
    ["min-width", "48px"],
    ["min-height", "48px"],
    [
      "max-width",
      "calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))",
    ],
    [
      "max-height",
      "calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))",
    ],
    ["margin", "0"],
    ["padding", "0"],
    ["border", "0"],
    ["overflow", "visible"],
    ["pointer-events", "auto"],
    ["isolation", "isolate"],
  ]

  for (const [property, value] of styles) {
    if (
      host.style.getPropertyValue(property) !== value
      || host.style.getPropertyPriority(property) !== "important"
    ) {
      host.style.setProperty(property, value, "important")
    }
  }
}

export interface PanelMountDocument {
  fullscreenElement: Element | null
  body: HTMLElement | null
  documentElement: HTMLElement
}

export function resolvePanelMountTarget(
  documentRef: PanelMountDocument = document,
): Element {
  return (
    documentRef.fullscreenElement
    ?? documentRef.body
    ?? documentRef.documentElement
  )
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

  function setValueIfChanged(input: HTMLInputElement, value: string): void {
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

    shadow = host.attachShadow({ mode: "open" })

    const style = document.createElement("style")
    const wrap = document.createElement("div")
    const fab = document.createElement("button")
    const panel = document.createElement("div")
    const header = document.createElement("div")
    const title = document.createElement("div")
    const badge = document.createElement("span")
    const titleText = document.createElement("span")
    const close = document.createElement("button")
    const content = document.createElement("div")
    const grid = document.createElement("div")
    const enabled = createSwitchRow(
      "enabled",
      "自动恢复",
      "暂停后自动恢复播放",
    )
    const interval = createNumberRow(
      "interval",
      "检测间隔",
      "单位 ms（200~10000）",
      200,
      10_000,
      100,
    )
    const minPaused = createNumberRow(
      "min-paused",
      "暂停阈值",
      "暂停多久才尝试恢复（秒）",
      0,
      30,
      0.5,
    )
    const autoSkipAds = createSwitchRow(
      "auto-skip-ads",
      "自动跳过广告",
      "按钮优先；必要时推进有限时长广告",
    )
    const avoidTyping = createSwitchRow(
      "avoid-typing",
      "打字时不干预",
      "避免影响搜索或评论输入",
    )
    const avoidEnded = createSwitchRow(
      "avoid-ended",
      "结束后不重播",
      "视频结束后不自动播放",
    )
    const status = document.createElement("div")
    const lastAction = document.createElement("div")
    const footer = document.createElement("div")
    const resumeNow = document.createElement("button")
    const skipNow = document.createElement("button")

    style.textContent = PANEL_CSS
    wrap.className = "wrap"

    fab.className = "fab"
    fab.type = "button"
    fab.title = "YouTube Auto Resume"
    fab.setAttribute("aria-label", "打开 YouTube Auto Resume 面板")
    fabAuroraController = mountFabAurora(fab, createIcon("bolt"))

    panel.className = "panel fade-in"
    panel.setAttribute("role", "dialog")
    panel.setAttribute("aria-label", "YouTube Auto Resume")

    header.className = "header"
    title.className = "title"
    badge.className = "badge"
    badge.appendChild(createIcon("bolt"))
    titleText.textContent = "Auto Resume"
    title.append(badge, titleText)

    close.className = "icon-button"
    close.type = "button"
    close.title = "最小化面板"
    close.setAttribute("aria-label", "最小化面板")
    close.appendChild(createIcon("x"))
    header.append(title, close)

    content.className = "content"
    grid.className = "grid"
    grid.append(
      enabled.row,
      interval.row,
      minPaused.row,
      autoSkipAds.row,
      avoidTyping.row,
      avoidEnded.row,
    )

    status.className = "status"
    status.textContent = statusText
    lastAction.className = "last-action"
    lastAction.textContent = currentLastActionText
    lastAction.setAttribute("role", "status")
    lastAction.setAttribute("aria-live", "polite")
    lastAction.setAttribute("aria-atomic", "true")

    footer.className = "footer"
    resumeNow.className = "button button-primary"
    resumeNow.type = "button"
    resumeNow.append(createIcon("play"), "立即恢复")
    skipNow.className = "button"
    skipNow.type = "button"
    skipNow.append(createIcon("forward"), "跳过广告")
    footer.append(resumeNow, skipNow)

    content.append(grid, status, lastAction, footer)
    panel.append(header, content)
    wrap.append(fab, panel)
    shadow.append(style, wrap)

    elements = {
      fab,
      panel,
      close,
      enabled: enabled.input,
      interval: interval.input,
      minPaused: minPaused.input,
      autoSkipAds: autoSkipAds.input,
      avoidTyping: avoidTyping.input,
      avoidEnded: avoidEnded.input,
      status,
      lastAction,
    }

    fab.addEventListener("click", () => setOpen(true))
    close.addEventListener("click", () => setOpen(false))
    enabled.input.addEventListener("change", applySettingsFromUi)
    interval.input.addEventListener("change", applySettingsFromUi)
    minPaused.input.addEventListener("change", applySettingsFromUi)
    autoSkipAds.input.addEventListener("change", applySettingsFromUi)
    avoidTyping.input.addEventListener("change", applySettingsFromUi)
    avoidEnded.input.addEventListener("change", applySettingsFromUi)
    resumeNow.addEventListener("click", onResumeNow)
    skipNow.addEventListener("click", onSkipNow)
    panel.addEventListener("keydown", (event) => {
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
