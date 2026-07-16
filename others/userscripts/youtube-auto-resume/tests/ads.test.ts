import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

import {
  createAdSkipper,
  findSkipAdButton,
  getAdUiSnapshot,
  isPlaybackEnforcementVisible,
} from "../src/youtube/ads.ts"
import type { ActiveYouTubePlayerContext } from "../src/youtube/player.ts"
import { asElement, FakeDocument, FakeElement } from "./youtubeTestDom.ts"

function createContext(
  player: FakeElement,
  video: FakeElement,
): ActiveYouTubePlayerContext {
  return {
    player: asElement(player),
    video: asElement(video) as HTMLVideoElement,
  }
}

test("ad integration contains no playback, overlay, or network bypass", async () => {
  const source = await readFile(
    resolve(import.meta.dirname, "..", "src", "youtube", "ads.ts"),
    "utf8",
  )

  assert.doesNotMatch(source, /\bvideo\.currentTime\s*=/)
  assert.doesNotMatch(source, /\bplaybackRate\s*=/)
  assert.doesNotMatch(source, /overlay-close|AD_OVERLAY/)
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest/)
})

test("ad lookup skips hidden and disabled candidates", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const hiddenButton = new FakeElement(documentRef)
  const disabledButton = new FakeElement(documentRef)
  const visibleButton = new FakeElement(documentRef)

  hiddenButton.style.display = "none"
  disabledButton.disabled = true
  player.append(hiddenButton)
  player.append(disabledButton)
  player.append(visibleButton)
  player.queryResults = [hiddenButton, disabledButton, visibleButton]

  assert.equal(findSkipAdButton(asElement(player)), visibleButton)
})

test("ad lookup rejects controls hidden by an ancestor", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const hiddenContainer = new FakeElement(documentRef)
  const hiddenButton = new FakeElement(documentRef)
  const visibleButton = new FakeElement(documentRef)

  hiddenContainer.style.opacity = "0"
  player.append(hiddenContainer)
  hiddenContainer.append(hiddenButton)
  player.append(visibleButton)
  player.queryResults = [hiddenButton, visibleButton]

  assert.equal(findSkipAdButton(asElement(player)), visibleButton)
})

for (const [name, block] of [
  ["aria-hidden", (element: FakeElement) => element.setAttribute("aria-hidden", "true")],
  ["inert", (element: FakeElement) => element.setAttribute("inert", "")],
  ["opacity", (element: FakeElement) => { element.style.opacity = "0" }],
] as const) {
  test(`ad lookup rejects a player hidden by outer ${name}`, () => {
    const documentRef = new FakeDocument()
    const outer = new FakeElement(documentRef)
    const player = new FakeElement(documentRef)
    const button = new FakeElement(documentRef)

    block(outer)
    outer.append(player)
    player.append(button)
    player.queryResults = [button]

    assert.equal(findSkipAdButton(asElement(player)), null)
  })
}

test("ad lookup rejects a control with disabled pointer events", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const button = new FakeElement(documentRef)

  button.style.pointerEvents = "none"
  player.append(button)
  player.queryResults = [button]

  assert.equal(findSkipAdButton(asElement(player)), null)
})

test("ad lookup allows a control that restores outer pointer events", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const overlay = new FakeElement(documentRef)
  const button = new FakeElement(documentRef)

  overlay.style.pointerEvents = "none"
  button.style.pointerEvents = "auto"
  player.append(overlay)
  overlay.append(button)
  player.queryResults = [button]

  assert.equal(findSkipAdButton(asElement(player)), button)
})

test("ad lookup promotes matched text to its interactive control", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const button = new FakeElement(documentRef, { control: true })
  const label = new FakeElement(documentRef)

  player.append(button)
  button.append(label)
  player.queryResults = [label]

  assert.equal(findSkipAdButton(asElement(player)), button)
})

test("visible in-player enforcement is detected without interaction", () => {
  const documentRef = new FakeDocument()
  const enforcementMessage = new FakeElement(documentRef)

  documentRef.enforcementMessage = enforcementMessage

  assert.equal(
    isPlaybackEnforcementVisible(documentRef.toDocument()),
    true,
  )
  assert.equal(enforcementMessage.clickCount, 0)
})

test("hidden in-player enforcement does not suspend normal handling", () => {
  const documentRef = new FakeDocument()
  const enforcementMessage = new FakeElement(documentRef)

  enforcementMessage.style.display = "none"
  documentRef.enforcementMessage = enforcementMessage

  assert.equal(
    isPlaybackEnforcementVisible(documentRef.toDocument()),
    false,
  )
})

test("ad skipper only searches the injected active player", () => {
  const documentRef = new FakeDocument()
  const inactivePlayer = new FakeElement(documentRef)
  const activePlayer = new FakeElement(documentRef)
  const inactiveButton = new FakeElement(documentRef)
  const video = new FakeElement(documentRef)

  inactivePlayer.append(inactiveButton)
  inactivePlayer.queryResults = [inactiveButton]

  const skipper = createAdSkipper({
    getPlayerContext: () => createContext(activePlayer, video),
    getSettings: () => ({ autoSkipAds: true }),
  })

  assert.equal(skipper.trySkipAdsIfPossible().acted, false)
  assert.equal(inactiveButton.clickCount, 0)
})

test("automatic handling retries a persistent YouTube control after a delay", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const button = new FakeElement(documentRef)
  const video = new FakeElement(documentRef)
  let currentTime = 1000

  player.append(button)
  player.queryResults = [button]

  const skipper = createAdSkipper({
    cooldownMs: 750,
    getPlayerContext: () => createContext(player, video),
    getSettings: () => ({ autoSkipAds: true }),
    sameControlRetryMs: 1500,
    now: () => currentTime,
  })

  assert.equal(skipper.trySkipAdsIfPossible().acted, true)
  currentTime += 750
  assert.equal(skipper.trySkipAdsIfPossible().acted, false)
  currentTime += 750
  assert.equal(skipper.trySkipAdsIfPossible().acted, true)
  assert.equal(button.clickCount, 2)
})

test("automatic handling can click a replacement YouTube control", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const firstButton = new FakeElement(documentRef)
  const secondButton = new FakeElement(documentRef)
  const video = new FakeElement(documentRef)
  let currentTime = 1000

  player.append(firstButton)
  player.append(secondButton)
  player.queryResults = [firstButton]

  const skipper = createAdSkipper({
    getPlayerContext: () => createContext(player, video),
    getSettings: () => ({ autoSkipAds: true }),
    now: () => currentTime,
  })

  assert.equal(skipper.trySkipAdsIfPossible().acted, true)
  player.queryResults = [secondButton]
  currentTime += 750
  assert.equal(skipper.trySkipAdsIfPossible().acted, true)
  assert.equal(firstButton.clickCount, 1)
  assert.equal(secondButton.clickCount, 1)
})

test("automatic handling can click a reused control after it disappears", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const button = new FakeElement(documentRef)
  const video = new FakeElement(documentRef)
  let currentTime = 1000

  player.append(button)
  player.queryResults = [button]

  const skipper = createAdSkipper({
    getPlayerContext: () => createContext(player, video),
    getSettings: () => ({ autoSkipAds: true }),
    now: () => currentTime,
  })

  assert.equal(skipper.trySkipAdsIfPossible().acted, true)
  player.queryResults = []
  currentTime += 750
  assert.equal(skipper.trySkipAdsIfPossible().acted, false)
  player.queryResults = [button]
  currentTime += 750
  assert.equal(skipper.trySkipAdsIfPossible().acted, true)
  assert.equal(button.clickCount, 2)
})

test("manual handling can retry the official control without seeking media", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const button = new FakeElement(documentRef)
  const video = new FakeElement(documentRef)

  player.classList.add("ad-showing")
  player.append(button)
  player.queryResults = [button]
  video.duration = 30
  video.seekRanges = [[0, 30]]

  const skipper = createAdSkipper({
    getPlayerContext: () => createContext(player, video),
    getSettings: () => ({ autoSkipAds: false }),
    now: () => 1000,
  })

  assert.equal(
    skipper.trySkipAdsIfPossible({ force: true }).acted,
    true,
  )
  assert.equal(
    skipper.trySkipAdsIfPossible({ force: true }).acted,
    true,
  )
  assert.equal(button.clickCount, 2)
  assert.equal(video.currentTime, 0)
})

test("unskippable ads are left to play normally", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const video = new FakeElement(documentRef)

  player.classList.add("ad-interrupting")
  video.duration = 15
  video.seekRanges = [[0, 15]]

  const result = createAdSkipper({
    getPlayerContext: () => createContext(player, video),
    getSettings: () => ({ autoSkipAds: true }),
  }).trySkipAdsIfPossible()

  assert.equal(result.acted, false)
  assert.equal(video.currentTime, 0)
})

test("disabled automatic handling does not click available controls", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const button = new FakeElement(documentRef)
  const video = new FakeElement(documentRef)

  player.append(button)
  player.queryResults = [button]

  const result = createAdSkipper({
    getPlayerContext: () => createContext(player, video),
    getSettings: () => ({ autoSkipAds: false }),
  }).trySkipAdsIfPossible()

  assert.equal(result.acted, false)
  assert.equal(button.clickCount, 0)
})

test("ad snapshot only reports controls exposed by the active player", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const video = new FakeElement(documentRef)

  assert.deepEqual(
    getAdUiSnapshot({
      getPlayerContext: () => createContext(player, video),
    }),
    {
      canSkipAd: false,
    },
  )
})
