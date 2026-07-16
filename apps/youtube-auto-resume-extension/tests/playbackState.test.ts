import assert from "node:assert/strict"
import test from "node:test"

import { createPlaybackState } from "../src/core/playbackState.ts"

function createVideo(
  overrides: Partial<Pick<HTMLVideoElement, "ended" | "paused">> = {},
): HTMLVideoElement {
  return {
    ended: false,
    paused: true,
    ...overrides,
  } as HTMLVideoElement
}

test("activating a replacement video resets its pause clock", () => {
  const state = createPlaybackState()
  const firstVideo = createVideo()
  const secondVideo = createVideo()

  state.activate(firstVideo, 100)
  state.markPaused(firstVideo, 100)
  state.activate(secondVideo, 5_000)

  assert.equal(state.getPauseStartedAt(firstVideo), null)
  assert.equal(state.getPauseStartedAt(secondVideo), 5_000)
})

test("only one resume attempt can run for the active video", () => {
  const state = createPlaybackState()
  const video = createVideo()

  state.activate(video, 100)
  const attempt = state.beginResume(video)

  assert.ok(attempt)
  assert.equal(state.beginResume(video), null)
  assert.equal(state.finishResume(attempt), true)
  assert.ok(state.beginResume(video))
})

test("a resume attempt becomes stale after the active video changes", () => {
  const state = createPlaybackState()
  const firstVideo = createVideo()
  const secondVideo = createVideo()

  state.activate(firstVideo, 100)
  const attempt = state.beginResume(firstVideo)
  assert.ok(attempt)

  state.activate(secondVideo, 200)

  assert.equal(state.finishResume(attempt), false)
  assert.ok(state.beginResume(secondVideo))
})

test("renewing a reused video element invalidates its previous attempt", () => {
  const state = createPlaybackState()
  const video = createVideo()

  state.activate(video, 100)
  const attempt = state.beginResume(video)
  assert.ok(attempt)

  state.renew(video, 500)

  assert.equal(state.finishResume(attempt), false)
  assert.equal(state.getPauseStartedAt(video), 500)
})

test("playing and ended videos do not keep a pause clock", () => {
  const state = createPlaybackState()
  const playingVideo = createVideo({ paused: false })
  const endedVideo = createVideo({ ended: true })

  state.activate(playingVideo, 100)
  assert.equal(state.getPauseStartedAt(playingVideo), null)

  state.activate(endedVideo, 200)
  assert.equal(state.getPauseStartedAt(endedVideo), null)
})
