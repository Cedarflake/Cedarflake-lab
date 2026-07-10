const bestScoreKey = "liminal-drift:best-score"

function getBestScoreStorage() {
  if (typeof window === "undefined") {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readBestScore() {
  const storage = getBestScoreStorage()

  if (!storage) {
    return 0
  }

  const value = storage.getItem(bestScoreKey)
  const score = Number(value)

  return Number.isFinite(score) && score > 0 ? score : 0
}

export function saveBestScore(score: number) {
  const storage = getBestScoreStorage()

  if (!storage) {
    return
  }

  try {
    storage.setItem(bestScoreKey, String(score))
  } catch {
    return
  }
}
