import type { Settings } from "./core/settings.ts"
import {
  getAdUiSnapshot,
  isPlaybackEnforcementVisible,
} from "./youtube/ads.ts"
import {
  getPlayerPlaybackQuality,
  type ActiveYouTubePlayerContext,
} from "./youtube/player.ts"
import { getQualityLabel } from "./youtube/quality.ts"

interface VideoStateSnapshot {
  canSkipAd: boolean
  currentTime: number | null
  ended: boolean | null
  hasVideo: boolean
  hasPlaybackEnforcement: boolean
  paused: boolean | null
  playbackQuality: string | null
  readyState: number | null
}

function getStateSnapshot(
  context: ActiveYouTubePlayerContext | null,
): VideoStateSnapshot {
  const adUi = getAdUiSnapshot({
    getPlayerContext: () => context,
  })

  if (!context) {
    return {
      canSkipAd: false,
      currentTime: null,
      ended: null,
      hasVideo: false,
      hasPlaybackEnforcement: isPlaybackEnforcementVisible(),
      paused: null,
      playbackQuality: null,
      readyState: null,
    }
  }

  const video = context.video

  return {
    canSkipAd: adUi.canSkipAd,
    currentTime: Number.isFinite(video.currentTime) ? video.currentTime : null,
    ended: video.ended,
    hasVideo: true,
    hasPlaybackEnforcement: isPlaybackEnforcementVisible(),
    paused: video.paused,
    playbackQuality: getPlayerPlaybackQuality(context.player),
    readyState: video.readyState,
  }
}

export function formatAppStatus(
  context: ActiveYouTubePlayerContext | null,
  settings: Settings,
): string {
  const snapshot = getStateSnapshot(context)

  if (!snapshot.hasVideo) {
    return [
      "检测到活动视频：否",
      `YouTube 播放限制提示：${snapshot.hasPlaybackEnforcement ? "已显示" : "无"}`,
      "提示：当前页面没有受支持的 YouTube 播放器",
    ].join("\n")
  }

  return [
    "检测到活动视频：是",
    `暂停：${snapshot.paused ? "是" : "否"}`,
    `结束：${snapshot.ended ? "是" : "否"}`,
    `播放位置：${snapshot.currentTime === null ? "-" : snapshot.currentTime.toFixed(1)}`,
    `可点击跳过按钮：${snapshot.canSkipAd ? "是" : "否"}`,
    `YouTube 播放限制提示：${snapshot.hasPlaybackEnforcement ? "已显示" : "无"}`,
    `目标画质：${getQualityLabel(settings.preferredQuality)}`,
    `当前画质：${snapshot.playbackQuality ?? "-"}`,
    `检测间隔：${settings.intervalMs}ms`,
    `暂停阈值：${settings.minPausedSeconds}s`,
  ].join("\n")
}
