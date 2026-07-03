import { chromium, devices } from "playwright"

import { measureSceneDifference, screenshotCanvas } from "./browserVisualChecks.mjs"

const url = process.argv.find((value) => value.startsWith("http")) ?? "http://localhost:5173/"

/**
 * @param {string} text
 * @param {string} label
 */
function readMetric(text, label) {
  const match = text.match(new RegExp(`${label}\\s+(\\d+)`, "i"))
  return match ? Number(match[1]) : 0
}

/**
 * @param {import("playwright").Page} page
 * @param {string} label
 */
async function readProgressValue(page, label) {
  const value = Number(
    await page.getByRole("progressbar", { name: label }).getAttribute("aria-valuenow"),
  )

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid progress value for ${label}`)
  }

  return value
}

/**
 * @param {import("playwright").Page} page
 * @param {string} label
 * @param {number} timeoutMs
 */
async function waitForProgressAboveZero(page, label, timeoutMs) {
  const startedAt = Date.now()
  let value = 0

  while (Date.now() - startedAt < timeoutMs) {
    value = await readProgressValue(page, label)

    if (value > 0) {
      return value
    }

    await page.waitForTimeout(120)
  }

  return value
}

/**
 * @param {import("playwright").Page} page
 */
async function installMockGamepad(page) {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 16 }, () => ({
      pressed: false,
      value: 0,
    }))
    const gamepad = {
      axes: [0, 0, 0, 0],
      buttons,
      connected: true,
      id: "Mock Xbox Controller",
      index: 0,
      mapping: "standard",
      timestamp: 0,
    }

    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [gamepad],
    })

    /**
     * @param {{ axes?: number[], buttons?: Record<string, number> }} [state]
     */
    function setMockGamepad(state = {}) {
      const axes = state.axes ?? []
      const nextButtons = state.buttons ?? {}

      gamepad.axes = [0, 0, 0, 0]

      for (const [index, value] of axes.entries()) {
        gamepad.axes[index] = value
      }

      for (const button of buttons) {
        button.pressed = false
        button.value = 0
      }

      for (const [index, value] of Object.entries(nextButtons)) {
        const button = buttons[Number(index)]

        if (!button) {
          continue
        }

        button.pressed = value > 0
        button.value = value
      }

      gamepad.timestamp += 1
    }

    Reflect.set(window, "__setMockGamepad", setMockGamepad)
  })
}

/**
 * @param {import("playwright").Page} page
 * @param {{ axes?: number[], buttons?: Record<string, number> }} state
 */
async function setMockGamepad(page, state) {
  await page.evaluate((nextState) => {
    const setMockGamepadState = Reflect.get(window, "__setMockGamepad")

    if (typeof setMockGamepadState !== "function") {
      throw new Error("Mock gamepad setter is not installed")
    }

    setMockGamepadState(nextState)
  }, state)
}

const browser = await chromium.launch()
let keyboardSceneDifference = 0

try {
  {
    const context = await browser.newContext({ ...devices["Pixel 7"] })
    const page = await context.newPage()

    await page.goto(url, { waitUntil: "domcontentloaded" })
    await page.getByRole("heading", { name: "Desktop required" }).waitFor()

    if ((await page.locator("canvas").count()) > 0) {
      throw new Error("Expected mobile view to avoid loading the 3D canvas")
    }

    await context.close()
  }

  {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto(url, { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "Start driving" }).click()
    await page.locator("canvas").waitFor()
    await page.waitForTimeout(500)
    const beforeKeyboardMotion = await screenshotCanvas(page)
    await page.keyboard.down("w")
    await page.waitForTimeout(700)
    const afterKeyboardMotion = await screenshotCanvas(page)
    keyboardSceneDifference = measureSceneDifference(beforeKeyboardMotion, afterKeyboardMotion)

    if (keyboardSceneDifference < 1.2) {
      throw new Error(`Expected W input to visibly move the scene, got ${keyboardSceneDifference}`)
    }

    await page.keyboard.down("d")
    await page.keyboard.down("Space")
    const driftCharge = await waitForProgressAboveZero(page, "Drift charge", 4200)

    const text = await page.locator("body").innerText()
    const keyboardSpeed = readMetric(text, "SPEED")

    if (driftCharge <= 0) {
      throw new Error(`Expected keyboard drifting to build charge, got ${driftCharge}`)
    }

    await page.keyboard.down("Escape")
    await page.getByRole("dialog", { name: "Paused" }).waitFor()
    await page.keyboard.up("Space")
    await page.keyboard.up("d")
    await page.keyboard.up("w")
    await page.getByRole("button", { name: "Resume" }).click()
    await page.waitForTimeout(1000)

    const resumedText = await page.locator("body").innerText()
    const resumedSpeed = readMetric(resumedText, "SPEED")

    if (resumedSpeed > keyboardSpeed + 5) {
      throw new Error(
        `Expected keyboard input to reset on pause, got ${keyboardSpeed} -> ${resumedSpeed}`,
      )
    }

    await page.keyboard.up("Escape")
    await context.close()
  }

  {
    const context = await browser.newContext()
    const page = await context.newPage()

    await installMockGamepad(page)
    await page.goto(url, { waitUntil: "domcontentloaded" })
    await page.getByRole("dialog", { name: "Start race" }).waitFor()
    await setMockGamepad(page, { buttons: { 0: 1 } })
    await page.waitForTimeout(160)
    await setMockGamepad(page, { buttons: {} })
    await page.locator("canvas").waitFor()
    await page.waitForTimeout(350)
    await setMockGamepad(page, { buttons: { 7: 1 } })
    await page.waitForTimeout(900)

    const text = await page.locator("body").innerText()
    const gamepadSpeed = readMetric(text, "SPEED")

    if (gamepadSpeed <= 0) {
      throw new Error(`Expected Xbox RT input to drive, got ${gamepadSpeed}`)
    }

    await setMockGamepad(page, { buttons: { 9: 1 } })
    await page.getByRole("dialog", { name: "Paused" }).waitFor()
    await setMockGamepad(page, { buttons: {} })
    await context.close()
  }
} finally {
  await browser.close()
}

console.log("interaction ok", { keyboardSceneDifference })
