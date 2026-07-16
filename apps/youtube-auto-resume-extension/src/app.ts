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
  findSkipAdButton,
  isPlaybackEnforcementVisible,
} from "./youtube/ads.ts"
import {
  isPlayerShowingAd,
  resolveActivePlayerContext,
  type ActiveYouTubePlayerContext,
} from "./youtube/player.ts"
import { createLoopNavigationTracker } from "./youtube/loopNavigation.ts"
import { createLoopPlayerController } from "./youtube/loopPlayer.ts"
import {
  createLoopTargetController,
  getWatchVideoId,
} from "./youtube/loopTarget.ts"
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
  const loopTarget = createLoopTargetController(
    settings.autoLoop,
    getWatchVideoId(window.location.href),
  )
  let activeContext: ActiveYouTubePlayerContext | null = null
  let lastActionText = "尚未执行"
  let timerId: number | null = null
  let timerDueAt = 0
  let nextResumeAllowedAt = 0
  let isLoopTargetRestorePending = false
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

  const loopPlayer = createLoopPlayerController({
    getEnabled: () => settings.autoLoop,
    onAdStateChange: (isShowingAd) => {
      if (settings.autoLoop) {
        loopTarget.armUnexpectedNavigationGuard(Date.now())
      }

      if (settings.autoLoop && enforceLoopTarget()) {
        return false
      }

      if (!isShowingAd) {
        scheduleNextLoop(0)
      }

      return true
    },
    onLoopReasserted: () => {
      loopTarget.armUnexpectedNavigationGuard(Date.now())
      setLastAction("广告结束，已重新确认当前视频循环")
    },
  })
  const loopNavigation = createLoopNavigationTracker({
    getEnabled: () => settings.autoLoop,
    onNavigationCheck: () => scheduleNextLoop(0),
    onUserNavigation: (videoId) => {
      loopTarget.markUserNavigation(videoId, Date.now())
    },
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
      updateNativeSkipControl()
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
      configureLoopTarget()
      syncAutoLoopPlayer()
      renewActivePlaybackState()
      setLastAction(
        result.persisted
          ? "设置已保存"
          : "设置已应用，但浏览器未能持久化",
      )
      panel.render(settings, lastActionText)
      scheduleNextLoop(0)
    },
    onNativeSkipActivated: () => {
      if (isStopped) {
        return
      }

      setLastAction("已交给 YouTube 原生按钮处理跳过")
    },
    saveSettings,
  })

  function detachVideoListeners(video: HTMLVideoElement): void {
    video.removeEventListener("emptied", handleVideoSourceChange)
    video.removeEventListener("ended", handleVideoEnded)
    video.removeEventListener("loadedmetadata", handleVideoSourceChange)
    video.removeEventListener("pause", handleVideoPause)
    video.removeEventListener("play", handleVideoPlay)
    video.removeEventListener("playing", handleVideoPlay)
  }

  function attachVideoListeners(video: HTMLVideoElement): void {
    video.addEventListener("emptied", handleVideoSourceChange)
    video.addEventListener("ended", handleVideoEnded)
    video.addEventListener("loadedmetadata", handleVideoSourceChange)
    video.addEventListener("pause", handleVideoPause)
    video.addEventListener("play", handleVideoPlay)
    video.addEventListener("playing", handleVideoPlay)
  }

  function getCurrentWatchVideoId(): string | null {
    return getWatchVideoId(window.location.href)
  }

  function configureLoopTarget(): void {
    loopTarget.configure(settings.autoLoop, getCurrentWatchVideoId())

    if (!settings.autoLoop) {
      isLoopTargetRestorePending = false
    }
  }

  function restoreLoopTarget(videoId: string): boolean {
    if (isLoopTargetRestorePending) {
      return true
    }

    isLoopTargetRestorePending = true
    setLastAction("检测到 YouTube 自动换片，正在返回循环目标")

    const targetUrl = new URL("/watch", window.location.origin)
    targetUrl.searchParams.set("v", videoId)
    window.location.replace(targetUrl.href)

    return true
  }

  function enforceLoopTarget(): boolean {
    const currentVideoId = getCurrentWatchVideoId()

    loopTarget.configure(settings.autoLoop, currentVideoId)

    if (!settings.autoLoop || !currentVideoId) {
      return false
    }

    const targetVideoId = loopTarget.resolveUnexpectedNavigation(
      currentVideoId,
      Date.now(),
    )

    if (targetVideoId) {
      return restoreLoopTarget(targetVideoId)
    }

    if (loopTarget.getTargetVideoId() === currentVideoId) {
      isLoopTargetRestorePending = false
    }

    return false
  }

  function syncAutoLoopPlayer(): boolean {
    const wasLoopReasserted = loopPlayer.sync()

    if (wasLoopReasserted) {
      loopTarget.armUnexpectedNavigationGuard(Date.now())
    }

    return wasLoopReasserted
  }

  function setActiveContext(
    nextContext: ActiveYouTubePlayerContext | null,
  ): boolean {
    const previousPlayer = activeContext?.player ?? null
    const nextPlayer = nextContext?.player ?? null
    const previousVideo = activeContext?.video ?? null
    const nextVideo = nextContext?.video ?? null

    activeContext = nextContext

    if (previousPlayer !== nextPlayer) {
      loopPlayer.setPlayer(nextPlayer)
    }

    if (previousVideo === nextVideo) {
      syncAutoLoopPlayer()
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

    syncAutoLoopPlayer()

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

  function updateNativeSkipControl(): void {
    if (isStopped || isPlaybackEnforcementVisible()) {
      panel.setNativeSkipControl(null)
      return
    }

    panel.setNativeSkipControl(
      activeContext ? findSkipAdButton(activeContext.player) : null,
    )
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

    if (enforceLoopTarget()) {
      return
    }

    syncAutoLoopPlayer()
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
    const video = event.currentTarget as HTMLVideoElement

    if (settings.autoLoop) {
      loopTarget.armUnexpectedNavigationGuard(Date.now())
    }

    playbackState.markPlaying(video)
    updatePanelStatus()
  }

  function handleVideoSourceChange(event: Event): void {
    const video = event.currentTarget as HTMLVideoElement

    if (enforceLoopTarget()) {
      return
    }

    syncAutoLoopPlayer()
    playbackState.renew(video, Date.now())
    nextResumeAllowedAt = 0
    scheduleNextLoop(0)
  }

  function handleNavigationStart(): void {
    setActiveContext(null)
    updateNativeSkipControl()
    updatePanelStatus()
  }

  function handleNavigationFinish(): void {
    if (enforceLoopTarget()) {
      return
    }

    scheduleNextLoop(0)
  }

  function handleStorage(event: StorageEvent): void {
    if (event.key !== null && event.key !== store.key) {
      return
    }

    settings = store.reload()
    configureLoopTarget()
    syncAutoLoopPlayer()
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
      || (video.ended && !isForced)
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

    if (enforceLoopTarget()) {
      return
    }

    refreshActiveContext()
    syncAutoLoopPlayer()
    updateNativeSkipControl()

    if (!isPlaybackEnforcementVisible()) {
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
    loopNavigation.stop()
    loopPlayer.stop()

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
  loopNavigation.start()
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
      configureLoopTarget()
      syncAutoLoopPlayer()
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
