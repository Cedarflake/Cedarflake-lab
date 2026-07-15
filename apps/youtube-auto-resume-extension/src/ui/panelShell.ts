import { mountFabAurora, type FabAuroraController } from "./fabAurora.ts"
import { createIcon } from "./icons.ts"
import {
  createNumberRow,
  createSelectRow,
  createSwitchRow,
} from "./panelControls.ts"
import { PANEL_CSS } from "./panelStyles.ts"

export interface PanelElements {
  fab: HTMLButtonElement
  panel: HTMLDivElement
  close: HTMLButtonElement
  enabled: HTMLInputElement
  interval: HTMLInputElement
  minPaused: HTMLInputElement
  autoSkipAds: HTMLInputElement
  preferredQuality: HTMLSelectElement
  avoidTyping: HTMLInputElement
  avoidEnded: HTMLInputElement
  status: HTMLDivElement
  lastAction: HTMLDivElement
  resumeNow: HTMLButtonElement
  skipNow: HTMLButtonElement
}

export interface PanelShell {
  shadow: ShadowRoot
  elements: PanelElements
  fabAuroraController: FabAuroraController
}

export interface PanelShellOptions {
  statusText: string
  lastActionText: string
}

export function createPanelShell(
  host: HTMLDivElement,
  options: PanelShellOptions,
): PanelShell {
  const shadow = host.attachShadow({ mode: "open" })
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
    "自动点击跳过按钮",
    "仅点击 YouTube 明确显示的跳过按钮",
  )
  const preferredQuality = createSelectRow(
    "preferred-quality",
    "目标画质",
    "不可用时选择最接近的较低画质",
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
  const fabAuroraController = mountFabAurora(fab, createIcon("bolt"))

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
    preferredQuality.row,
    avoidTyping.row,
    avoidEnded.row,
  )

  status.className = "status"
  status.textContent = options.statusText
  lastAction.className = "last-action"
  lastAction.textContent = options.lastActionText
  lastAction.setAttribute("role", "status")
  lastAction.setAttribute("aria-live", "polite")
  lastAction.setAttribute("aria-atomic", "true")

  footer.className = "footer"
  resumeNow.className = "button button-primary"
  resumeNow.type = "button"
  resumeNow.append(createIcon("play"), "立即恢复")
  skipNow.className = "button"
  skipNow.type = "button"
  skipNow.append(createIcon("forward"), "点击跳过按钮")
  footer.append(resumeNow, skipNow)

  content.append(grid, status, lastAction, footer)
  panel.append(header, content)
  wrap.append(fab, panel)
  shadow.append(style, wrap)

  return {
    shadow,
    fabAuroraController,
    elements: {
      fab,
      panel,
      close,
      enabled: enabled.input,
      interval: interval.input,
      minPaused: minPaused.input,
      autoSkipAds: autoSkipAds.input,
      preferredQuality: preferredQuality.select,
      avoidTyping: avoidTyping.input,
      avoidEnded: avoidEnded.input,
      status,
      lastAction,
      resumeNow,
      skipNow,
    },
  }
}
