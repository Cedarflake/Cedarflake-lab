import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveFabAuroraIntroFrame,
  shortestAngleDelta,
} from "../src/ui/fabAurora.ts"

test("Aurora angle delta takes the shortest path across the wrap point", () => {
  assert.equal(shortestAngleDelta(179, -179), 2)
  assert.equal(shortestAngleDelta(-179, 179), -2)
})

test("Aurora angle delta preserves ordinary direction", () => {
  assert.equal(shortestAngleDelta(10, 80), 70)
  assert.equal(shortestAngleDelta(80, 10), -70)
})

test("Aurora angle delta uses a stable half-turn direction", () => {
  assert.equal(shortestAngleDelta(0, 180), -180)
  assert.equal(shortestAngleDelta(180, 0), 180)
})

test("Aurora angle delta normalizes equivalent multi-turn angles", () => {
  assert.equal(shortestAngleDelta(0, -720), 0)
  assert.equal(shortestAngleDelta(720, 0), 0)
  assert.equal(shortestAngleDelta(541, -179), 0)
  assert.equal(shortestAngleDelta(721, 7), 6)
})

test("Aurora intro morphs from a transparent sweep into a complete ring", () => {
  assert.deepEqual(resolveFabAuroraIntroFrame(0), {
    blurPx: 1,
    focus: 1,
    gradientAngle: 170,
    maskAngle: -90,
    opacity: 0,
  })
  assert.deepEqual(resolveFabAuroraIntroFrame(1), {
    blurPx: 4,
    focus: 0,
    gradientAngle: 225,
    maskAngle: 200,
    opacity: 1,
  })
})

test("Aurora intro sweeps continuously before expanding", () => {
  const earlyFrame = resolveFabAuroraIntroFrame(0.2)
  const middleFrame = resolveFabAuroraIntroFrame(0.4)
  const lateFrame = resolveFabAuroraIntroFrame(0.84)

  assert.ok(earlyFrame.opacity > 0)
  assert.equal(middleFrame.opacity, 1)
  assert.equal(middleFrame.focus, 1)
  assert.ok(lateFrame.focus > 0)
  assert.ok(lateFrame.focus < 1)
  assert.ok(middleFrame.maskAngle > earlyFrame.maskAngle)
  assert.ok(middleFrame.gradientAngle > earlyFrame.gradientAngle)
  assert.notEqual(middleFrame.blurPx, earlyFrame.blurPx)
})

test("Aurora intro clamps progress outside its timeline", () => {
  assert.deepEqual(
    resolveFabAuroraIntroFrame(-1),
    resolveFabAuroraIntroFrame(0),
  )
  assert.deepEqual(
    resolveFabAuroraIntroFrame(2),
    resolveFabAuroraIntroFrame(1),
  )
})
