import assert from "node:assert/strict"
import test from "node:test"

import {
  resolvePanelMountTarget,
  type PanelMountDocument,
} from "../src/ui/panel.ts"
import { isTypingContext } from "../src/core/typing.ts"

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

function createActiveElement(
  tagName: string,
  nestedActiveElement: Element | null = null,
): Element {
  return {
    isContentEditable: false,
    shadowRoot: nestedActiveElement
      ? { activeElement: nestedActiveElement }
      : null,
    tagName,
  } as unknown as Element
}

test("typing detection follows the active element through shadow roots", () => {
  const input = createActiveElement("INPUT")
  const nestedHost = createActiveElement("YT-FORMATTED-STRING", input)
  const outerHost = createActiveElement("YTD-APP", nestedHost)
  const documentRef = { activeElement: outerHost } as Document

  assert.equal(isTypingContext(documentRef), true)
})

test("typing detection ignores a non-editable shadow descendant", () => {
  const button = createActiveElement("BUTTON")
  const host = createActiveElement("YTD-APP", button)
  const documentRef = { activeElement: host } as Document

  assert.equal(isTypingContext(documentRef), false)
})
