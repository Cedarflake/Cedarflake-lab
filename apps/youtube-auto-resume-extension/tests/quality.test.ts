import assert from "node:assert/strict"
import test from "node:test"

import {
  createQualityManager,
  getQualityLabel,
  resolvePreferredQuality,
} from "../src/youtube/quality.ts"
import type {
  ActiveYouTubePlayerContext,
  YouTubePlayerElement,
} from "../src/youtube/player.ts"

function createPlayer(isAd = false): YouTubePlayerElement {
  return {
    classList: {
      contains: (token: string) => isAd && token === "ad-showing",
    },
  } as unknown as YouTubePlayerElement
}

function createContext(player: YouTubePlayerElement): ActiveYouTubePlayerContext {
  return {
    player,
    video: {} as HTMLVideoElement,
  }
}

test("quality preference resolves exact and closest-lower levels", () => {
  assert.equal(
    resolvePreferredQuality("hd2160", ["medium", "hd1080", "hd2160"]),
    "hd2160",
  )
  assert.equal(
    resolvePreferredQuality("hd2160", ["medium", "hd1080", "hd4320"]),
    "hd1080",
  )
  assert.equal(resolvePreferredQuality("tiny", ["medium"]), null)
  assert.equal(resolvePreferredQuality("auto", null), "auto")
  assert.equal(getQualityLabel("hd1080"), "1080p")
})

test("quality manager applies the selected level with a lower fallback", () => {
  const player = createPlayer()
  const applied: string[] = []
  const actions: string[] = []
  const manager = createQualityManager({
    getSettings: () => ({ preferredQuality: "hd2160" }),
    getPlayerContext: () => createContext(player),
    getAvailableQualityLevels: () => ["medium", "hd1080"],
    getPlaybackQuality: () => "medium",
    setPlaybackQuality: (_player, quality) => {
      applied.push(quality)
      return true
    },
    onAction: (message) => actions.push(message),
    now: () => 10_000,
  })

  assert.equal(manager.trySetPreferredQualityIfPossible(), true)
  assert.deepEqual(applied, ["hd1080"])
  assert.deepEqual(actions, ["已尝试将画质调为：1080p"])
})

test("automatic quality is applied once for each active player", () => {
  const firstPlayer = createPlayer()
  const secondPlayer = createPlayer()
  let activePlayer = firstPlayer
  let setCalls = 0
  const manager = createQualityManager({
    getSettings: () => ({ preferredQuality: "auto" }),
    getPlayerContext: () => createContext(activePlayer),
    getAvailableQualityLevels: () => null,
    getPlaybackQuality: () => "hd1080",
    setPlaybackQuality: (_player, quality) => {
      assert.equal(quality, "auto")
      setCalls += 1
      return true
    },
  })

  assert.equal(manager.trySetPreferredQualityIfPossible(), true)
  assert.equal(
    manager.trySetPreferredQualityIfPossible({ force: true }),
    false,
  )

  activePlayer = secondPlayer
  assert.equal(manager.trySetPreferredQualityIfPossible(), true)
  assert.equal(setCalls, 2)
})

test("quality manager preserves matching and ad playback states", () => {
  let setCalls = 0
  const manager = createQualityManager({
    getSettings: () => ({ preferredQuality: "hd1080" }),
    getPlayerContext: () => createContext(createPlayer()),
    getAvailableQualityLevels: () => ["medium", "hd1080"],
    getPlaybackQuality: () => "hd1080",
    setPlaybackQuality: () => {
      setCalls += 1
      return true
    },
  })

  assert.equal(manager.trySetPreferredQualityIfPossible(), false)

  const adManager = createQualityManager({
    getSettings: () => ({ preferredQuality: "hd1080" }),
    getPlayerContext: () => createContext(createPlayer(true)),
    getAvailableQualityLevels: () => ["hd1080"],
    getPlaybackQuality: () => "medium",
    setPlaybackQuality: () => {
      setCalls += 1
      return true
    },
  })

  assert.equal(
    adManager.trySetPreferredQualityIfPossible({ force: true }),
    false,
  )
  assert.equal(setCalls, 0)
})

test("changing the preference bypasses throttle for the active player", () => {
  const player = createPlayer()
  let preference: "hd1080" | "hd720" = "hd1080"
  let now = 1_000
  const applied: string[] = []
  const manager = createQualityManager({
    getSettings: () => ({ preferredQuality: preference }),
    getPlayerContext: () => createContext(player),
    getAvailableQualityLevels: () => ["hd1080", "hd720"],
    getPlaybackQuality: () => "medium",
    setPlaybackQuality: (_player, quality) => {
      applied.push(quality)
      return true
    },
    now: () => now,
    throttleMs: 5_000,
  })

  assert.equal(manager.trySetPreferredQualityIfPossible(), true)

  now = 2_000
  assert.equal(manager.trySetPreferredQualityIfPossible(), false)

  preference = "hd720"
  assert.equal(manager.trySetPreferredQualityIfPossible(), true)
  assert.deepEqual(applied, ["hd1080", "hd720"])
})
