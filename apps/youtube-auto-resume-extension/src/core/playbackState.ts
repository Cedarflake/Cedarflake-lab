export interface ResumeAttempt {
  readonly generation: number
  readonly video: HTMLVideoElement
}

export interface PlaybackState {
  activate(video: HTMLVideoElement | null, now: number): boolean
  beginResume(video: HTMLVideoElement): ResumeAttempt | null
  finishResume(attempt: ResumeAttempt): boolean
  getPauseStartedAt(video: HTMLVideoElement): number | null
  markPaused(video: HTMLVideoElement, now: number): void
  markPlaying(video: HTMLVideoElement): void
  renew(video: HTMLVideoElement, now: number): void
  reset(): void
}

export function createPlaybackState(): PlaybackState {
  let activeVideo: HTMLVideoElement | null = null
  let generation = 0
  let pauseStartedAt: number | null = null
  let resumeAttempt: ResumeAttempt | null = null

  function activate(video: HTMLVideoElement | null, now: number): boolean {
    if (video === activeVideo) {
      return false
    }

    activeVideo = video
    generation += 1
    resumeAttempt = null
    pauseStartedAt =
      video?.paused === true && video.ended === false ? now : null
    return true
  }

  function beginResume(video: HTMLVideoElement): ResumeAttempt | null {
    if (video !== activeVideo || resumeAttempt) {
      return null
    }

    resumeAttempt = { generation, video }
    return resumeAttempt
  }

  function finishResume(attempt: ResumeAttempt): boolean {
    const isCurrent =
      attempt === resumeAttempt &&
      attempt.generation === generation &&
      attempt.video === activeVideo

    if (attempt === resumeAttempt) {
      resumeAttempt = null
    }

    return isCurrent
  }

  function getPauseStartedAt(video: HTMLVideoElement): number | null {
    return video === activeVideo ? pauseStartedAt : null
  }

  function markPaused(video: HTMLVideoElement, now: number): void {
    if (video === activeVideo && pauseStartedAt === null) {
      pauseStartedAt = now
    }
  }

  function markPlaying(video: HTMLVideoElement): void {
    if (video === activeVideo) {
      pauseStartedAt = null
    }
  }

  function renew(video: HTMLVideoElement, now: number): void {
    if (video !== activeVideo) {
      return
    }

    generation += 1
    resumeAttempt = null
    pauseStartedAt = video.paused && !video.ended ? now : null
  }

  function reset(): void {
    activeVideo = null
    generation += 1
    pauseStartedAt = null
    resumeAttempt = null
  }

  return {
    activate,
    beginResume,
    finishResume,
    getPauseStartedAt,
    markPaused,
    markPlaying,
    renew,
    reset,
  }
}
