import {
  createSettingsStore,
  DEFAULT_SETTINGS,
  type Settings,
} from "./core/settings.ts"
import { nowText } from "./core/time.ts"
import { isTypingContext } from "./core/typing.ts"
import { createPanelView } from "./ui/panel.ts"
import { createAdSkipper, getAdUiSnapshot } from "./youtube/ads.ts"
import { getPlaybackQuality, getVideo } from "./youtube/player.ts"
import { createQualityManager } from "./youtube/quality.ts"

export interface AppEnvironment {
  loadedText?: string
}

export interface YouTubeAutoResumeApp {
  openPanel: () => void
  resetSettings: () => Settings
  stop: () => void
}

interface ResumeOptions {
  force?: boolean
}

interface VideoStateSnapshot {
  canCloseAdOverlay: boolean
  canSkipAd: boolean
  currentTime: number | null
  ended: boolean | null
  hasVideo: boolean
  paused: boolean | null
  readyState: number | null
}

function getStateSnapshot(video: HTMLVideoElement | null): VideoStateSnapshot {
  const adUi = getAdUiSnapshot()

  if (!video) {
    return {
      canCloseAdOverlay: adUi.canCloseAdOverlay,
      canSkipAd: adUi.canSkipAd,
      currentTime: null,
      ended: null,
      hasVideo: false,
      paused: null,
      readyState: null,
    }
  }

  return {
    canCloseAdOverlay: adUi.canCloseAdOverlay,
    canSkipAd: adUi.canSkipAd,
    currentTime: Number.isFinite(video.currentTime) ? video.currentTime : null,
    ended: video.ended,
    hasVideo: true,
    paused: video.paused,
    readyState: video.readyState,
  }
}

function formatStatus(
  snapshot: VideoStateSnapshot,
  settings: Settings,
  playbackQuality: string | null,
): string {
  if (!snapshot.hasVideo) {
    return "检测到视频：否\n提示：请确认页面中有正在播放的 YouTube 视频"
  }

  return [
    "检测到视频：是",
    `暂停：${snapshot.paused ? "是" : "否"}`,
    `结束：${snapshot.ended ? "是" : "否"}`,
    `播放位置：${snapshot.currentTime === null ? "-" : snapshot.currentTime.toFixed(1)}`,
    `可跳过广告：${snapshot.canSkipAd ? "是" : "否"}`,
    `可关闭广告遮罩：${snapshot.canCloseAdOverlay ? "是" : "否"}`,
    `最佳画质：${settings.bestQuality ? "是" : "否"}`,
    `当前画质：${playbackQuality ?? "-"}`,
    `检测间隔：${settings.intervalMs}ms`,
    `暂停阈值：${settings.minPausedSeconds}s`,
  ].join("\n")
}

export function startYouTubeAutoResumeApp(
  environment: AppEnvironment = {},
): YouTubeAutoResumeApp {
  const store = createSettingsStore({})
  let settings = store.get()
  let lastPausedAt = 0
  let lastActionText = "尚未执行"
  let timerId: number | null = null
  let isStopped = false

  const setLastAction = (text: string): void => {
    lastActionText = `${nowText()} ${text}`
    panel.setLastActionText(lastActionText)
  }

  const qualityManager = createQualityManager({
    getSettings: () => settings,
    onAction: setLastAction,
  })
  const adSkipper = createAdSkipper({
    getSettings: () => settings,
    onAction: setLastAction,
  })
  const panel = createPanelView({
    getSettings: () => settings,
    onResumeNow: () => {
      setLastAction("手动触发恢复")
      void tryResume({ force: true })
    },
    onSettingsApplied: (savedSettings) => {
      settings = savedSettings
      setLastAction("设置已保存")
      panel.render(settings, lastActionText)
      scheduleNextLoop(0)
    },
    onSkipNow: () => {
      setLastAction("手动触发跳过")
      adSkipper.trySkipAdsIfPossible({ force: true })
    },
    saveSettings: (nextSettings) => {
      settings = store.save(nextSettings)
      return settings
    },
  })

  const ensurePanel = (): void => {
    panel.ensureMounted()
    panel.render(settings, lastActionText)
  }

  const tryResume = async (options: ResumeOptions = {}): Promise<void> => {
    const isForced = options.force === true
    const video = getVideo()
    const snapshot = getStateSnapshot(video)

    ensurePanel()
    panel.setStatus(formatStatus(snapshot, settings, getPlaybackQuality()))

    if ((!settings.enabled && !isForced) || !video) {
      return
    }

    if (settings.avoidTyping && isTypingContext() && !isForced) {
      return
    }

    if (settings.avoidEnded && video.ended && !isForced) {
      return
    }

    if (!video.paused) {
      lastPausedAt = 0
      return
    }

    const now = Date.now()

    if (lastPausedAt === 0) {
      lastPausedAt = now
    }

    if (!isForced && (now - lastPausedAt) / 1_000 < settings.minPausedSeconds) {
      return
    }

    try {
      await video.play()
      lastPausedAt = 0
      setLastAction("检测到暂停，已尝试恢复播放")
    } catch {
      setLastAction("恢复播放失败，可能受到浏览器自动播放策略限制")
    }
  }

  const scheduleNextLoop = (delay = settings.intervalMs): void => {
    if (timerId !== null) {
      window.clearTimeout(timerId)
    }

    if (isStopped) {
      return
    }

    timerId = window.setTimeout(runLoop, delay)
  }

  const runLoop = (): void => {
    settings = store.reload()
    adSkipper.trySkipAdsIfPossible()
    qualityManager.trySetBestQualityIfPossible()
    void tryResume()
    scheduleNextLoop()
  }

  ensurePanel()
  setLastAction(environment.loadedText ?? "脚本已加载")
  scheduleNextLoop(0)

  return {
    openPanel: () => {
      settings = store.save({
        ...settings,
        collapsed: false,
      })
      panel.ensureMounted()
      panel.open()
      panel.render(settings, lastActionText)
    },
    resetSettings: () => {
      settings = store.save(DEFAULT_SETTINGS)
      panel.ensureMounted()
      panel.render(settings, lastActionText)
      scheduleNextLoop(0)
      return settings
    },
    stop: () => {
      isStopped = true

      if (timerId !== null) {
        window.clearTimeout(timerId)
        timerId = null
      }

      panel.destroy()
    },
  }
}
