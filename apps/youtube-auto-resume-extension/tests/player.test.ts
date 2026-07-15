import assert from "node:assert/strict"
import test from "node:test"

import {
  getMoviePlayer,
  getPlayerAvailableQualityLevels,
  getPlayerPlaybackQuality,
  getVideo,
  isPlayerShowingAd,
  resolveActivePlayerContext,
  setPlayerPlaybackQuality,
  type YouTubePlayerElement,
} from "../src/youtube/player.ts"
import { FakeDocument, FakeElement } from "./youtubeTestDom.ts"

test("offscreen watch owner wins over a generic visible preview", () => {
  const documentRef = new FakeDocument()
  const hiddenPlayer = new FakeElement(documentRef, {
    height: 720,
    watchPlayer: true,
    width: 1280,
  })
  const hiddenVideo = new FakeElement(documentRef, {
    height: 720,
    width: 1280,
  })
  const visiblePlayer = new FakeElement(documentRef, {
    height: 360,
    width: 640,
  })
  const visibleVideo = new FakeElement(documentRef, {
    height: 360,
    width: 640,
  })

  hiddenPlayer.style.display = "none"
  hiddenPlayer.video = hiddenVideo
  hiddenPlayer.append(hiddenVideo)
  visiblePlayer.video = visibleVideo
  visiblePlayer.append(visibleVideo)
  documentRef.players = [hiddenPlayer, visiblePlayer]

  const context = resolveActivePlayerContext(documentRef.toDocument())

  assert.equal(context?.player, hiddenPlayer)
  assert.equal(context?.video, hiddenVideo)
})

test("active Shorts player wins over other visible players", () => {
  const documentRef = new FakeDocument(1280, 720, "/shorts/example")
  const inactivePlayer = new FakeElement(documentRef, {
    height: 720,
    width: 1280,
  })
  const inactiveVideo = new FakeElement(documentRef, {
    height: 720,
    width: 1280,
  })
  const activePlayer = new FakeElement(documentRef, {
    activeShorts: true,
    height: 600,
    width: 340,
  })
  const activeVideo = new FakeElement(documentRef, {
    height: 600,
    width: 340,
  })

  inactivePlayer.video = inactiveVideo
  inactivePlayer.append(inactiveVideo)
  activePlayer.video = activeVideo
  activePlayer.append(activeVideo)
  documentRef.players = [inactivePlayer, activePlayer]

  assert.equal(
    resolveActivePlayerContext(documentRef.toDocument())?.player,
    activePlayer,
  )
})

test("fullscreen player has the highest priority", () => {
  const documentRef = new FakeDocument(1280, 720, "/shorts/example")
  const activeShortsPlayer = new FakeElement(documentRef, {
    activeShorts: true,
    height: 600,
    width: 340,
  })
  const activeShortsVideo = new FakeElement(documentRef, {
    height: 600,
    width: 340,
  })
  const fullscreenPlayer = new FakeElement(documentRef, {
    height: 360,
    width: 640,
  })
  const fullscreenVideo = new FakeElement(documentRef, {
    height: 360,
    width: 640,
  })

  activeShortsPlayer.video = activeShortsVideo
  activeShortsPlayer.append(activeShortsVideo)
  fullscreenPlayer.video = fullscreenVideo
  fullscreenPlayer.append(fullscreenVideo)
  documentRef.players = [activeShortsPlayer, fullscreenPlayer]
  documentRef.fullscreenElement = fullscreenVideo as unknown as Element

  assert.equal(
    resolveActivePlayerContext(documentRef.toDocument())?.player,
    fullscreenPlayer,
  )
})

test("miniplayer is supported outside watch and Shorts routes", () => {
  const documentRef = new FakeDocument(1280, 720, "/")
  const previewPlayer = new FakeElement(documentRef, {
    height: 500,
    width: 900,
  })
  const previewVideo = new FakeElement(documentRef, {
    height: 500,
    width: 900,
  })
  const miniplayer = new FakeElement(documentRef, {
    height: 180,
    miniplayer: true,
    width: 320,
  })
  const miniplayerVideo = new FakeElement(documentRef, {
    height: 180,
    width: 320,
  })

  previewPlayer.video = previewVideo
  previewPlayer.append(previewVideo)
  miniplayer.video = miniplayerVideo
  miniplayer.append(miniplayerVideo)
  documentRef.players = [previewPlayer, miniplayer]

  assert.equal(
    resolveActivePlayerContext(documentRef.toDocument())?.player,
    miniplayer,
  )
})

test("generic homepage previews are not active player contexts", () => {
  const documentRef = new FakeDocument(1280, 720, "/")
  const previewPlayer = new FakeElement(documentRef, {
    height: 500,
    width: 900,
  })
  const previewVideo = new FakeElement(documentRef, {
    height: 500,
    width: 900,
  })

  previewPlayer.video = previewVideo
  previewPlayer.append(previewVideo)
  documentRef.players = [previewPlayer]

  assert.equal(resolveActivePlayerContext(documentRef.toDocument()), null)
})

test("player helpers share the same scoped active context", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef, {
    height: 360,
    watchPlayer: true,
    width: 640,
  })
  const video = new FakeElement(documentRef, {
    height: 360,
    width: 640,
  })

  player.video = video
  player.append(video)
  documentRef.players = [player]

  assert.equal(getMoviePlayer(documentRef.toDocument()), player)
  assert.equal(getVideo(documentRef.toDocument()), video)

  documentRef.players = []

  assert.equal(getMoviePlayer(documentRef.toDocument()), null)
  assert.equal(getVideo(documentRef.toDocument()), null)
})

test("main video is preferred over earlier fallback videos", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef, {
    height: 360,
    watchPlayer: true,
    width: 640,
  })
  const fallbackVideo = new FakeElement(documentRef, {
    height: 120,
    width: 160,
  })
  const mainVideo = new FakeElement(documentRef, {
    height: 360,
    width: 640,
  })

  player.fallbackVideo = fallbackVideo
  player.video = mainVideo
  player.append(fallbackVideo)
  player.append(mainVideo)
  documentRef.players = [player]

  assert.equal(getVideo(documentRef.toDocument()), mainVideo)
})

test("player ad state recognizes both YouTube ad marker classes", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)

  assert.equal(isPlayerShowingAd(player as unknown as HTMLElement), false)

  player.classList.add("ad-showing")
  assert.equal(isPlayerShowingAd(player as unknown as HTMLElement), true)

  player.classList.remove("ad-showing")
  player.classList.add("ad-interrupting")
  assert.equal(isPlayerShowingAd(player as unknown as HTMLElement), true)
})

test("quality helpers validate player API responses and apply both controls", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef) as unknown as YouTubePlayerElement
  const rangeCalls: string[][] = []
  const qualityCalls: string[] = []

  player.getAvailableQualityLevels = () => ["hd1080", null, "hd720"]
  player.getPlaybackQuality = () => "hd720"
  player.setPlaybackQualityRange = (minimum, maximum) => {
    rangeCalls.push([minimum, maximum])
  }
  player.setPlaybackQuality = (quality) => {
    qualityCalls.push(quality)
  }

  assert.deepEqual(
    getPlayerAvailableQualityLevels(player),
    ["hd1080", "hd720"],
  )
  assert.equal(getPlayerPlaybackQuality(player), "hd720")
  assert.equal(setPlayerPlaybackQuality(player, "hd1080"), true)
  assert.deepEqual(rangeCalls, [["hd1080", "hd1080"]])
  assert.deepEqual(qualityCalls, ["hd1080"])
})

test("quality helpers tolerate unavailable or changing player APIs", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef) as unknown as YouTubePlayerElement

  assert.equal(getPlayerAvailableQualityLevels(player), null)
  assert.equal(getPlayerPlaybackQuality(player), null)
  assert.equal(setPlayerPlaybackQuality(player, "hd1080"), false)

  player.getAvailableQualityLevels = () => {
    throw new Error("unavailable")
  }
  player.getPlaybackQuality = () => 1080
  player.setPlaybackQualityRange = () => {
    throw new Error("stream replacement")
  }
  player.setPlaybackQuality = () => undefined

  assert.equal(getPlayerAvailableQualityLevels(player), null)
  assert.equal(getPlayerPlaybackQuality(player), null)
  assert.equal(setPlayerPlaybackQuality(player, "hd1080"), true)
})
