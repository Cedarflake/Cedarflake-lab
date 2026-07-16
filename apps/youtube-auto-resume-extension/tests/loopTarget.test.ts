import assert from "node:assert/strict"
import test from "node:test"

import {
  createLoopTargetController,
  getWatchVideoId,
} from "../src/youtube/loopTarget.ts"

test("watch video id parsing rejects non-watch and invalid URLs", () => {
  assert.equal(
    getWatchVideoId("https://www.youtube.com/watch?v=first-video"),
    "first-video",
  )
  assert.equal(getWatchVideoId("https://www.youtube.com/shorts/example"), null)
  assert.equal(getWatchVideoId("https://example.com/watch?v=external"), null)
  assert.equal(getWatchVideoId("not a url"), null)
})

test("enabled startup captures the current video before any settings change", () => {
  const target = createLoopTargetController(true, "startup-video")

  assert.equal(target.getTargetVideoId(), "startup-video")
})

test("an unguarded video change becomes the new loop target", () => {
  const target = createLoopTargetController(true, "first-video")

  assert.equal(
    target.resolveUnexpectedNavigation("user-selected-video", 1_000),
    null,
  )
  assert.equal(target.getTargetVideoId(), "user-selected-video")
})

test("a guarded automatic change restores the previous loop target", () => {
  const target = createLoopTargetController(true, "first-video")

  target.armUnexpectedNavigationGuard(1_000)

  assert.equal(
    target.resolveUnexpectedNavigation("automatic-next", 1_500),
    "first-video",
  )
})

test("an expired guard cannot pin a later video change", () => {
  const target = createLoopTargetController(true, "first-video")

  target.armUnexpectedNavigationGuard(1_000)

  assert.equal(
    target.resolveUnexpectedNavigation("later-video", 11_001),
    null,
  )
  assert.equal(target.getTargetVideoId(), "later-video")
})

test("leaving watch clears the guard before the next video", () => {
  const target = createLoopTargetController(true, "first-video")

  target.armUnexpectedNavigationGuard(1_000)

  assert.equal(target.resolveUnexpectedNavigation(null, 1_500), null)
  assert.equal(target.resolveUnexpectedNavigation("later-video", 2_000), null)
  assert.equal(target.getTargetVideoId(), "later-video")
})

test("enabling later captures the video active at that moment", () => {
  const target = createLoopTargetController(false, "ignored-video")

  target.configure(true, "enabled-video")

  assert.equal(target.getTargetVideoId(), "enabled-video")
})

test("explicit user selection replaces the loop target", () => {
  const target = createLoopTargetController(true, "first-video")

  target.armUnexpectedNavigationGuard(1_000)
  target.markUserNavigation("selected-video", 1_000)
  assert.equal(
    target.resolveUnexpectedNavigation("first-video", 1_100),
    null,
  )

  assert.equal(
    target.resolveUnexpectedNavigation("selected-video", 1_500),
    null,
  )
  assert.equal(target.getTargetVideoId(), "selected-video")
  target.armUnexpectedNavigationGuard(2_000)
  assert.equal(
    target.resolveUnexpectedNavigation("automatic-next", 2_000),
    "selected-video",
  )
})

test("expired or mismatched user intent cannot authorize automatic next", () => {
  const target = createLoopTargetController(true, "first-video")

  target.armUnexpectedNavigationGuard(1_000)
  target.markUserNavigation("different-video", 1_000)
  assert.equal(
    target.resolveUnexpectedNavigation("automatic-next", 1_500),
    "first-video",
  )

  target.armUnexpectedNavigationGuard(2_000)
  target.markUserNavigation(null, 2_000)
  assert.equal(
    target.resolveUnexpectedNavigation("late-next", 8_001),
    "first-video",
  )
})

test("disabling clears the remembered target", () => {
  const target = createLoopTargetController(true, "first-video")

  target.configure(false, "first-video")
  target.configure(true, "replacement-video")

  assert.equal(target.getTargetVideoId(), "replacement-video")
})
