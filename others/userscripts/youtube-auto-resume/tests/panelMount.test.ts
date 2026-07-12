import assert from "node:assert/strict"
import test from "node:test"

import {
  resolvePanelMountTarget,
  type PanelMountDocument,
} from "../src/ui/panel.ts"

function createElementStub(): HTMLElement {
  return new EventTarget() as HTMLElement
}

test("fullscreen element is the preferred panel mount target", () => {
  const fullscreenElement = createElementStub()
  const body = createElementStub()
  const documentElement = createElementStub()
  const documentRef: PanelMountDocument = {
    body,
    documentElement,
    fullscreenElement,
  }

  assert.equal(resolvePanelMountTarget(documentRef), fullscreenElement)
})

test("document body is used outside fullscreen", () => {
  const body = createElementStub()
  const documentRef: PanelMountDocument = {
    body,
    documentElement: createElementStub(),
    fullscreenElement: null,
  }

  assert.equal(resolvePanelMountTarget(documentRef), body)
})

test("document element is used before the body exists", () => {
  const documentElement = createElementStub()
  const documentRef: PanelMountDocument = {
    body: null,
    documentElement,
    fullscreenElement: null,
  }

  assert.equal(resolvePanelMountTarget(documentRef), documentElement)
})
