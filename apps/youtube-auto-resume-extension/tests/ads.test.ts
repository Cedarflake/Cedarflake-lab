import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import test from "node:test"

import {
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

test("ad integration only discovers visible native controls", async () => {
  const source = await readFile(
    resolve(import.meta.dirname, "..", "src", "youtube", "ads.ts"),
    "utf8",
  )

  assert.doesNotMatch(source, /\.click\s*\(/)
  assert.doesNotMatch(source, /dispatchEvent\s*\(/)
  assert.doesNotMatch(source, /\bvideo\.currentTime\s*=/)
  assert.doesNotMatch(source, /\bplaybackRate\s*=/)
  assert.doesNotMatch(source, /overlay-close|AD_OVERLAY/)
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest/)
})

test("ad lookup skips hidden and disabled candidates", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const hiddenButton = new FakeElement(documentRef, { control: true })
  const disabledButton = new FakeElement(documentRef, { control: true })
  const visibleButton = new FakeElement(documentRef, { control: true })

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
  const hiddenButton = new FakeElement(documentRef, { control: true })
  const visibleButton = new FakeElement(documentRef, { control: true })

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
    const button = new FakeElement(documentRef, { control: true })

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
  const button = new FakeElement(documentRef, { control: true })

  button.style.pointerEvents = "none"
  player.append(button)
  player.queryResults = [button]

  assert.equal(findSkipAdButton(asElement(player)), null)
})

test("ad lookup allows a control that restores outer pointer events", () => {
  const documentRef = new FakeDocument()
  const player = new FakeElement(documentRef)
  const overlay = new FakeElement(documentRef)
  const button = new FakeElement(documentRef, { control: true })

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

test("ad snapshot only reads the injected active player", () => {
  const documentRef = new FakeDocument()
  const inactivePlayer = new FakeElement(documentRef)
  const activePlayer = new FakeElement(documentRef)
  const inactiveButton = new FakeElement(documentRef, { control: true })
  const activeButton = new FakeElement(documentRef, { control: true })
  const video = new FakeElement(documentRef)

  inactivePlayer.append(inactiveButton)
  inactivePlayer.queryResults = [inactiveButton]
  activePlayer.append(activeButton)
  activePlayer.queryResults = [activeButton]

  assert.deepEqual(
    getAdUiSnapshot({
      getPlayerContext: () => createContext(activePlayer, video),
    }),
    { canSkipAd: true },
  )
  assert.equal(inactiveButton.clickCount, 0)
  assert.equal(activeButton.clickCount, 0)
})

test("ad snapshot reports no action without an active player", () => {
  assert.deepEqual(getAdUiSnapshot({ getPlayerContext: () => null }), {
    canSkipAd: false,
  })
})
