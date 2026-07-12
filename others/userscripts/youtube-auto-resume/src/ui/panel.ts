import {
  DEFAULT_SETTINGS,
  clampNumber,
  type Settings,
} from "../core/settings.ts"
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
    max-width: calc(100vw - 32px);
    color: #f1f1f1;
    font-family: "Roboto", "Arial", sans-serif;
    line-height: normal;
  }

  .hidden {
    display: none !important;
  }

  .fab {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    outline: none;
    background: rgba(33, 33, 33, 0.96);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
    color: #ff0000;
    cursor: pointer;
    backdrop-filter: blur(8px);
    transition: background-color 0.2s, transform 0.2s;
  }

  .fab:hover {
    background: rgba(63, 63, 63, 0.98);
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

  .fab svg {
    width: 24px;
    height: 24px;
  }

  .panel {
    width: 340px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
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

    .fab {
      border-color: rgba(0, 0, 0, 0.1);
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .fab:hover {
      background: rgba(240, 240, 240, 0.98);
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
`

export interface PanelViewOptions {
  getSettings: () => Settings
  saveSettings: (settings: Settings) => Settings
  onSettingsApplied?: (settings: Settings) => void
  onResumeNow?: () => void
  onSkipNow?: () => void
}

export interface PanelView {
  destroy: () => void
  ensureMounted: () => void
  setStatus: (text: string) => void
  setLastActionText: (text: string) => void
  render: (settings: Settings, lastActionText?: string) => void
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
  bestQuality: HTMLInputElement
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

function createLabel(title: string, description: string): HTMLDivElement {
  const label = document.createElement("div")
  const key = document.createElement("div")
  const detail = document.createElement("div")

  label.className = "label"
  key.className = "label-key"
  key.textContent = title
  detail.className = "label-description"
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
  control.setAttribute("aria-label", title)
  input.id = id
  input.type = "checkbox"
  track.className = "track"
  thumb.className = "thumb"
  track.appendChild(thumb)
  control.append(input, track)
  row.append(createLabel(title, description), control)

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
  input.setAttribute("aria-label", title)
  row.append(createLabel(title, description), input)

  return { row, input }
}

function applyHostStyles(host: HTMLDivElement): void {
  const styles: ReadonlyArray<readonly [string, string]> = [
    ["position", "fixed"],
    ["right", "16px"],
    ["bottom", "16px"],
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
    ["max-width", "calc(100vw - 32px)"],
    ["max-height", "calc(100vh - 32px)"],
    ["margin", "0"],
    ["padding", "0"],
    ["border", "0"],
    ["overflow", "visible"],
    ["pointer-events", "auto"],
    ["isolation", "isolate"],
  ]

  for (const [property, value] of styles) {
    host.style.setProperty(property, value, "important")
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
  let mountObserver: MutationObserver | null = null
  let observedMountTarget: Element | null = null
  let statusText = ""
  let currentLastActionText = ""

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
    ensureMounted()
    const saved = options.saveSettings({
      ...options.getSettings(),
      collapsed: !isOpen,
    })
    render(saved, currentLastActionText)
  }

  function applySettingsFromUi(): void {
    if (!elements) {
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
      bestQuality: elements.bestQuality.checked,
      avoidTyping: elements.avoidTyping.checked,
      avoidEnded: elements.avoidEnded.checked,
    }
    const saved = options.saveSettings(nextSettings)

    if (options.onSettingsApplied) {
      options.onSettingsApplied(saved)
      return
    }

    render(saved, currentLastActionText)
  }

  function buildPanel(): void {
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
      "启用",
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
      "检测跳过按钮和广告遮罩",
    )
    const bestQuality = createSwitchRow(
      "best-quality",
      "最佳画质",
      "自动切换到最高可用画质",
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
    fab.appendChild(createIcon("bolt"))

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
      bestQuality.row,
      avoidTyping.row,
      avoidEnded.row,
    )

    status.className = "status"
    status.textContent = statusText
    lastAction.className = "last-action"
    lastAction.textContent = currentLastActionText

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
      bestQuality: bestQuality.input,
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
    bestQuality.input.addEventListener("change", applySettingsFromUi)
    avoidTyping.input.addEventListener("change", applySettingsFromUi)
    avoidEnded.input.addEventListener("change", applySettingsFromUi)
    resumeNow.addEventListener("click", onResumeNow)
    skipNow.addEventListener("click", onSkipNow)

    render(options.getSettings(), currentLastActionText)
  }

  function ensureMounted(): void {
    if (!host) {
      buildPanel()
      watchMountState()
    }

    moveHostToCurrentTarget()
  }

  function setStatus(text: string): void {
    statusText = text
    ensureMounted()

    if (elements) {
      elements.status.textContent = statusText
    }
  }

  function setLastActionText(text: string): void {
    currentLastActionText = text
    ensureMounted()

    if (elements) {
      elements.lastAction.textContent = currentLastActionText
    }
  }

  function render(
    settings: Settings,
    nextLastActionText?: string,
  ): void {
    ensureMounted()

    if (!elements) {
      return
    }

    if (typeof nextLastActionText === "string") {
      currentLastActionText = nextLastActionText
    }

    const isOpen = !settings.collapsed
    elements.panel.classList.toggle("hidden", !isOpen)
    elements.fab.classList.toggle("hidden", isOpen)
    elements.enabled.checked = settings.enabled

    if (shadow?.activeElement !== elements.interval) {
      elements.interval.value = String(settings.intervalMs)
    }

    if (shadow?.activeElement !== elements.minPaused) {
      elements.minPaused.value = String(settings.minPausedSeconds)
    }

    elements.autoSkipAds.checked = settings.autoSkipAds
    elements.bestQuality.checked = settings.bestQuality
    elements.avoidTyping.checked = settings.avoidTyping
    elements.avoidEnded.checked = settings.avoidEnded
    elements.status.textContent = statusText
    elements.lastAction.textContent = currentLastActionText
  }

  function open(): void {
    setOpen(true)
  }

  function destroy(): void {
    mountObserver?.disconnect()
    mountObserver = null
    observedMountTarget = null
    document.removeEventListener("fullscreenchange", moveHostToCurrentTarget)
    host?.remove()
    host = null
    shadow = null
    elements = null
  }

  return {
    destroy,
    ensureMounted,
    setStatus,
    setLastActionText,
    render,
    open,
  }
}
