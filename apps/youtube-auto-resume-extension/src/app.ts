import { createPlaybackState } from "./core/playbackState.ts"
import {
  createSettingsStore,
  DEFAULT_SETTINGS,
  type Settings,
  type SettingsSaveResult,
} from "./core/settings.ts"
import { nowText } from "./core/time.ts"
import { isTypingContext } from "./core/typing.ts"
import { formatAppStatus } from "./appStatus.ts"
import { createPanelView } from "./ui/panel.ts"
import {
  createAdSkipper,
  isPlaybackEnforcementVisible,
} from "./youtube/ads.ts"
import {
  isPlayerShowingAd,
  resolveActivePlayerContext,
  type ActiveYouTubePlayerContext,
} from "./youtube/player.ts"
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
  shouldRefreshContext?: boolean
}

export function startYouTubeAutoResumeApp(
  environment: AppEnvironment = {},
): YouTubeAutoResumeApp {
  const store = createSettingsStore({})
  const playbackState = createPlaybackState()
  let settings = store.get()
  let activeContext: ActiveYouTubePlayerContext | null = null
  let lastActionText = "尚未执行"
  let timerId: number | null = null
  let timerDueAt = 0
  let nextResumeAllowedAt = 0
  let isStopped = false

  const setLastAction = (text: string): void => {
    if (isStopped) {
      return
    }

    lastActionText = `${nowText()} ${text}`
    panel.setLastActionText(lastActionText)
  }

  const saveSettings = (nextSettings: Settings): SettingsSaveResult => {
    if (isStopped) {
      return { persisted: false, settings }
    }

    const result = store.save(nextSettings)
    settings = result.settings
    return result
  }

  const adSkipper = createAdSkipper({
    getSettings: () => settings,
    getPlayerContext: () => activeContext,
    onAction: setLastAction,
  })
  const qualityManager = createQualityManager({
    getSettings: () => settings,
    getPlayerContext: () => activeContext,
    onAction: setLastAction,
  })
  const panel = createPanelView({
    getSettings: () => settings,
    onExpanded: () => {
      if (isStopped) {
        return
      }

      refreshActiveContext()
      updatePanelStatus()
    },
    onPanelStatePersistenceFailed: () => {
      if (isStopped) {
        return
      }

      setLastAction("面板显示状态已应用，但浏览器未能持久化")
    },
    onResumeNow: () => {
      if (isStopped) {
        return
      }

      setLastAction("手动触发恢复")
      void tryResume({ force: true })
    },
    onSettingsApplied: (result) => {
      if (isStopped) {
        return
      }

      settings = result.settings
      renewActivePlaybackState()
      setLastAction(
        result.persisted
          ? "设置已保存"
          : "设置已应用，但浏览器未能持久化",
      )
      panel.render(settings, lastActionText)
      scheduleNextLoop(0)
    },
    onSkipNow: () => {
      if (isStopped) {
        return
      }

      if (isPlaybackEnforcementVisible()) {
        setLastAction("检测到 YouTube 播放限制提示，未尝试绕过")
        return
      }

      setLastAction("手动查找 YouTube 跳过按钮")
      adSkipper.trySkipAdsIfPossible({ force: true })
    },
    saveSettings,
  })

  function detachVideoListeners(video: HTMLVideoElement): void {
    video.removeEventListener("emptied", handleVideoSourceChange)
    video.removeEventListener("ended", handleVideoEnded)
    video.removeEventListener("loadedmetadata", handleVideoSourceChange)
    video.removeEventListener("pause", handleVideoPause)
    video.removeEventListener("play", handleVideoPlay)
  }

  function attachVideoListeners(video: HTMLVideoElement): void {
    video.addEventListener("emptied", handleVideoSourceChange)
    video.addEventListener("ended", handleVideoEnded)
    video.addEventListener("loadedmetadata", handleVideoSourceChange)
    video.addEventListener("pause", handleVideoPause)
    video.addEventListener("play", handleVideoPlay)
  }

  function setActiveContext(
    nextContext: ActiveYouTubePlayerContext | null,
  ): boolean {
    const previousVideo = activeContext?.video ?? null
    const nextVideo = nextContext?.video ?? null
    activeContext = nextContext

    if (previousVideo === nextVideo) {
      return false
    }

    if (previousVideo) {
      detachVideoListeners(previousVideo)
    }

    playbackState.activate(nextVideo, Date.now())
    nextResumeAllowedAt = 0

    if (nextVideo) {
      attachVideoListeners(nextVideo)
    }

    return true
  }

  function refreshActiveContext(): boolean {
    return setActiveContext(resolveActivePlayerContext())
  }

  function renewActivePlaybackState(): void {
    const video = activeContext?.video

    if (video) {
      playbackState.renew(video, Date.now())
    }

    nextResumeAllowedAt = 0
  }

  function updatePanelStatus(): void {
    if (isStopped || !panel.isExpanded()) {
      return
    }

    panel.setStatus(formatAppStatus(activeContext, settings))
  }

  function scheduleNextLoop(delay = settings.intervalMs): void {
    if (isStopped) {
      return
    }

    const normalizedDelay = Math.max(0, delay)
    const dueAt = Date.now() + normalizedDelay

    if (timerId !== null && timerDueAt <= dueAt) {
      return
    }

    if (timerId !== null) {
      window.clearTimeout(timerId)
    }

    timerDueAt = dueAt
    timerId = window.setTimeout(() => {
      timerId = null
      timerDueAt = 0
      runLoop()
    }, normalizedDelay)
  }

  function handleVideoPlay(event: Event): void {
    const video = event.currentTarget as HTMLVideoElement

    playbackState.markPlaying(video)
    nextResumeAllowedAt = 0
    updatePanelStatus()
  }

  function handleVideoPause(event: Event): void {
    const video = event.currentTarget as HTMLVideoElement

    if (video.ended) {
      playbackState.markPlaying(video)
      return
    }

    playbackState.markPaused(video, Date.now())
    scheduleNextLoop(settings.minPausedSeconds * 1_000)
    updatePanelStatus()
  }

  function handleVideoEnded(event: Event): void {
    playbackState.markPlaying(event.currentTarget as HTMLVideoElement)
    updatePanelStatus()
  }

  function handleVideoSourceChange(event: Event): void {
    const video = event.currentTarget as HTMLVideoElement

    playbackState.renew(video, Date.now())
    nextResumeAllowedAt = 0
    scheduleNextLoop(0)
  }

  function handleNavigationStart(): void {
    setActiveContext(null)
    updatePanelStatus()
  }

  function handleNavigationFinish(): void {
    scheduleNextLoop(0)
  }

  function handleStorage(event: StorageEvent): void {
    if (event.key !== null && event.key !== store.key) {
      return
    }

    settings = store.reload()
    renewActivePlaybackState()
    panel.render(settings, lastActionText)
    scheduleNextLoop(0)
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === "visible") {
      scheduleNextLoop(0)
    }
  }

  async function tryResume(options: ResumeOptions = {}): Promise<void> {
    if (isStopped) {
      return
    }

    const isForced = options.force === true

    if (options.shouldRefreshContext !== false) {
      refreshActiveContext()
    }

    updatePanelStatus()

    if (
      isPlaybackEnforcementVisible()
      || Boolean(
        activeContext
        && isPlayerShowingAd(activeContext.player),
      )
    ) {
      if (isForced) {
        setLastAction("广告或播放限制期间不执行恢复播放")
      }

      return
    }

    const video = activeContext?.video

    if (!video) {
      return
    }

    if (!video.paused) {
      playbackState.markPlaying(video)
      return
    }

    const now = Date.now()
    playbackState.markPaused(video, now)

    if ((!settings.enabled && !isForced)
      || (settings.avoidTyping && isTypingContext() && !isForced)
      || (settings.avoidEnded && video.ended && !isForced)
      || (!isForced && video.readyState < 2)
      || (!isForced && now < nextResumeAllowedAt)) {
      return
    }

    const pausedAt = playbackState.getPauseStartedAt(video)

    if (
      !isForced
      && pausedAt !== null
      && (now - pausedAt) / 1_000 < settings.minPausedSeconds
    ) {
      scheduleNextLoop(
        settings.minPausedSeconds * 1_000 - (now - pausedAt),
      )
      return
    }

    const attempt = playbackState.beginResume(video)

    if (!attempt) {
      return
    }

    try {
      await video.play()

      if (!playbackState.finishResume(attempt) || isStopped) {
        return
      }

      playbackState.markPlaying(video)
      nextResumeAllowedAt = 0
      setLastAction("检测到暂停，已恢复播放")
    } catch {
      if (!playbackState.finishResume(attempt) || isStopped) {
        return
      }

      nextResumeAllowedAt = Date.now() + Math.max(5_000, settings.intervalMs * 3)
      setLastAction("恢复播放失败，等待浏览器允许后重试")
      scheduleNextLoop(nextResumeAllowedAt - Date.now())
    } finally {
      if (!isStopped) {
        updatePanelStatus()
      }
    }
  }

  function runLoop(): void {
    if (isStopped) {
      return
    }

    refreshActiveContext()

    if (!isPlaybackEnforcementVisible()) {
      adSkipper.trySkipAdsIfPossible()
      qualityManager.trySetPreferredQualityIfPossible()
    }

    void tryResume({ shouldRefreshContext: false })
    scheduleNextLoop()
  }

  function stop(): void {
    if (isStopped) {
      return
    }

    isStopped = true

    if (timerId !== null) {
      window.clearTimeout(timerId)
      timerId = null
      timerDueAt = 0
    }

    const video = activeContext?.video

    if (video) {
      detachVideoListeners(video)
    }

    activeContext = null
    playbackState.reset()
    document.removeEventListener("visibilitychange", handleVisibilityChange)
    document.removeEventListener("yt-navigate-finish", handleNavigationFinish)
    document.removeEventListener("yt-navigate-start", handleNavigationStart)
    window.removeEventListener("storage", handleStorage)
    panel.destroy()
  }

  panel.ensureMounted()
  setLastAction(environment.loadedText ?? "脚本已加载")
  document.addEventListener("visibilitychange", handleVisibilityChange)
  document.addEventListener("yt-navigate-finish", handleNavigationFinish)
  document.addEventListener("yt-navigate-start", handleNavigationStart)
  window.addEventListener("storage", handleStorage)
  scheduleNextLoop(0)

  return {
    openPanel: () => {
      if (isStopped) {
        return
      }

      panel.ensureMounted()
      panel.open()
    },
    resetSettings: () => {
      if (isStopped) {
        return settings
      }

      const result = saveSettings({ ...DEFAULT_SETTINGS })
      renewActivePlaybackState()
      setLastAction(
        result.persisted
          ? "设置已重置"
          : "设置已重置，但浏览器未能持久化",
      )
      panel.render(settings, lastActionText)
      scheduleNextLoop(0)
      return settings
    },
    stop,
  }
}
