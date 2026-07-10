import { chromium, devices } from "playwright"

import { measureSceneDifference, screenshotCanvas } from "./browserVisualChecks.mjs"

const url = process.argv.find((value) => value.startsWith("http")) ?? "http://localhost:5173/"

/**
 * @param {string} baseUrl
 * @param {Record<string, string>} params
 */
function withSearchParams(baseUrl, params) {
  const nextUrl = new URL(baseUrl)

  for (const [key, value] of Object.entries(params)) {
    nextUrl.searchParams.set(key, value)
  }

  return nextUrl.toString()
}

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
    const startButton = page.getByRole("button", { name: "Start driving" })
    await startButton.waitFor()
    await Promise.all([startButton.click(), page.keyboard.down("w")])
    await page.locator("canvas").waitFor()
    await page.waitForTimeout(900)

    const startupText = await page.locator("body").innerText()
    const startupSpeed = readMetric(startupText, "SPEED")

    if (startupSpeed <= 0) {
      throw new Error(`Expected immediate W input after start to drive, got ${startupSpeed}`)
    }

    await page.evaluate(() => {
      window.dispatchEvent(new Event("blur"))
    })
    await page.waitForTimeout(700)

    const runningBlurText = await page.locator("body").innerText()
    const runningBlurSpeed = readMetric(runningBlurText, "SPEED")

    if (runningBlurSpeed <= startupSpeed + 3) {
      throw new Error(
        `Expected held W to survive visible running blur, got ${startupSpeed} -> ${runningBlurSpeed}`,
      )
    }

    await page.keyboard.up("w")
    await page.waitForTimeout(500)
    await page.evaluate(() => {
      window.dispatchEvent(new Event("blur"))
    })
    await page.waitForTimeout(300)

    if (await page.getByRole("dialog", { name: "Paused" }).isVisible()) {
      throw new Error("Expected startup blur to avoid opening the pause dialog")
    }

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

    if (driftCharge <= 0) {
      throw new Error(`Expected keyboard drifting to build charge, got ${driftCharge}`)
    }

    await page.keyboard.up("Space")
    await page.keyboard.up("d")
    await page.keyboard.down("Escape")
    await page.getByRole("dialog", { name: "Paused" }).waitFor()
    await page.keyboard.up("Escape")
    const pausedText = await page.locator("body").innerText()
    const pausedSpeed = readMetric(pausedText, "SPEED")
    await page.getByRole("button", { name: "Resume" }).click()
    await page.waitForTimeout(900)

    const heldResumeText = await page.locator("body").innerText()
    const heldResumeSpeed = readMetric(heldResumeText, "SPEED")

    if (heldResumeSpeed < pausedSpeed - 3) {
      throw new Error(
        `Expected held W to survive pause and resume, got ${pausedSpeed} -> ${heldResumeSpeed}`,
      )
    }

    await page.keyboard.up("w")
    await page.waitForTimeout(1000)

    const resumedText = await page.locator("body").innerText()
    const resumedSpeed = readMetric(resumedText, "SPEED")

    if (resumedSpeed >= heldResumeSpeed - 4) {
      throw new Error(
        `Expected released W to decelerate after resume, got ${heldResumeSpeed} -> ${resumedSpeed}`,
      )
    }

    await context.close()
  }

  {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto(withSearchParams(url, { debug: "no-obstacles" }), {
      waitUntil: "domcontentloaded",
    })
    await page.getByRole("button", { name: "Start driving" }).waitFor()

    const debugMode = await page.locator(".game-shell").getAttribute("data-debug-mode")

    if (debugMode !== "No obstacles") {
      throw new Error(`Expected no-obstacles debug mode marker, got ${debugMode}`)
    }

    await page.getByRole("button", { name: "Start driving" }).click()
    await page.keyboard.down("w")
    await page.waitForTimeout(5600)
    await page.keyboard.up("w")

    const integrity = await readProgressValue(page, "Vehicle integrity")

    if (integrity !== 100) {
      throw new Error(
        `Expected no-obstacles debug mode to avoid collision damage, got ${integrity}`,
      )
    }

    await context.close()
  }

  {
    const context = await browser.newContext()
    const page = await context.newPage()

    await installMockGamepad(page)
    await page.goto(url, { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "Start driving" }).waitFor()
    await setMockGamepad(page, { buttons: { 0: 1 } })
    await page.waitForTimeout(160)
    await setMockGamepad(page, { buttons: {} })
    await page.locator("canvas").waitFor()
    await page.locator(".race-control-button[aria-label='Pause']").waitFor()
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
