const backgroundMusicSources = {
  mp3: "/music/liminal-drift-theme.mp3",
  ogg: "/music/liminal-drift-theme.ogg",
} as const

let backgroundMusic: HTMLAudioElement | null = null

function resolveBackgroundMusicSrc() {
  const audio = document.createElement("audio")

  if (audio.canPlayType("audio/mpeg")) {
    return backgroundMusicSources.mp3
  }

  return backgroundMusicSources.ogg
}

function getBackgroundMusic() {
  if (backgroundMusic) {
    return backgroundMusic
  }

  backgroundMusic = new Audio(resolveBackgroundMusicSrc())
  backgroundMusic.loop = true
  backgroundMusic.preload = "auto"
  backgroundMusic.volume = 0.44
  backgroundMusic.dataset.backgroundMusic = "true"
  backgroundMusic.setAttribute("aria-hidden", "true")
  backgroundMusic.style.display = "none"
  document.body.append(backgroundMusic)

  return backgroundMusic
}

export function playBackgroundMusic() {
  const audio = getBackgroundMusic()

  return audio.play()
}

export function pauseBackgroundMusic() {
  backgroundMusic?.pause()
}

export function resetBackgroundMusic() {
  if (!backgroundMusic) {
    return
  }

  backgroundMusic.currentTime = 0
}

export function disposeBackgroundMusic() {
  if (!backgroundMusic) {
    return
  }

  backgroundMusic.pause()
  backgroundMusic.remove()
  backgroundMusic = null
}
