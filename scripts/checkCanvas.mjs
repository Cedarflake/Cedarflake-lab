import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { chromium, devices } from "playwright"

import {
  measurePeripheralDifference,
  measureSceneDifference,
  samplePng,
  screenshotCanvas,
} from "./browserVisualChecks.mjs"

const url = process.argv.find((value) => value.startsWith("http")) ?? "http://localhost:5173/"
const outputDir = new URL("../artifacts/", import.meta.url)
const outputPath = fileURLToPath(outputDir)

await mkdir(outputDir, { recursive: true })

/** @type {Array<{name: "desktop" | "mobile", options: import("playwright").BrowserContextOptions}>} */
const viewports = [
  {
    name: "desktop",
    options: {
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    },
  },
  {
    name: "mobile",
    options: {
      ...devices["Pixel 7"],
    },
  },
]

/**
 * @param {string[]} lines
 * @param {string} label
 */
function readMetric(lines, label) {
  const labelIndex = lines.findIndex((line) => line.toLowerCase() === label.toLowerCase())

  if (labelIndex < 0) {
    throw new Error(`Missing telemetry label: ${label}`)
  }

  const value = Number(lines[labelIndex + 1]?.replaceAll(",", "") ?? Number.NaN)

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid telemetry value for ${label}`)
  }

  return value
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
 */
async function assertModalDialog(page, label) {
  const modal = await page.getByRole("dialog", { name: label }).getAttribute("aria-modal")

  if (modal !== "true") {
    throw new Error(`Expected ${label} dialog to be modal`)
  }
}

/**
 * @param {import("playwright").Page} page
 * @param {number} delayMs
 */
async function delaySceneChunk(page, delayMs = 350) {
  await page.route("**/assets/LiminalRacerScene-*.js", async (route) => {
    await new Promise((resolve) => {
      setTimeout(resolve, delayMs)
    })
    await route.continue()
  })
}

/**
 * @param {import("playwright").Page} page
 */
async function assertStartupLoadingSequence(page) {
  await page.locator(".scene-loading").waitFor({ state: "visible" })

  if (await page.getByRole("dialog", { name: "Start race" }).isVisible()) {
    throw new Error("Expected start dialog to stay hidden while scene loading is visible")
  }

  await page.getByRole("dialog", { name: "Start race" }).waitFor()

  if (await page.locator(".scene-loading").isVisible()) {
    throw new Error("Expected scene loading to be removed before showing the start dialog")
  }
}

/**
 * @param {import("playwright").Page} page
 * @param {string} label
 */
async function assertActiveButton(page, label) {
  const activeLabel = await page.evaluate(() => {
    const activeElement = document.activeElement

    return activeElement instanceof HTMLButtonElement ? activeElement.innerText.trim() : ""
  })

  if (activeLabel !== label) {
    throw new Error(`Expected focused button "${label}", got "${activeLabel}"`)
  }
}

/**
 * @param {import("playwright").Page} page
 * @param {string} firstLabel
 * @param {string} lastLabel
 */
async function assertDialogTabWrap(page, firstLabel, lastLabel) {
  await assertActiveButton(page, firstLabel)
  await page.keyboard.press("Shift+Tab")
  await assertActiveButton(page, lastLabel)
  await page.keyboard.press("Tab")
  await assertActiveButton(page, firstLabel)
}

/**
 * @param {import("playwright").Page} page
 */
async function assertControlLegend(page) {
  const text = await page.getByRole("dialog", { name: "Start race" }).innerText()

  if (!text.includes("W / S / Up / Down") || !text.includes("Space / Shift")) {
    throw new Error(`Expected desktop keyboard control legend, got "${text}"`)
  }

  if (text.includes("Go / Brake") || text.includes("Drift button")) {
    throw new Error(`Expected touch legend to stay hidden on desktop, got "${text}"`)
  }
}

/**
 * @param {import("playwright").Page} page
 */
async function assertDesktopRequired(page) {
  const heading = page.getByRole("heading", { name: "Desktop required" })
  await heading.waitFor()

  const text = await page.locator(".desktop-required").innerText()

  if (!text.includes("desktop browser") || !text.includes("keyboard")) {
    throw new Error(`Expected mobile desktop-required message, got "${text}"`)
  }

  if ((await page.locator("canvas").count()) > 0) {
    throw new Error("Expected mobile view to avoid loading the 3D canvas")
  }
}

/**
 * @param {import("playwright").Page} page
 * @param {boolean} hidden
 */
async function assertAmbientGameHidden(page, hidden) {
  const expectedValue = String(hidden)
  const actualValues = {
    hud: await page.locator(".hud").getAttribute("aria-hidden"),
  }

  if (actualValues.hud !== expectedValue) {
    throw new Error(
      `Expected ambient game aria-hidden=${expectedValue}, got ${JSON.stringify(actualValues)}`,
    )
  }
}

/**
 * @param {import("playwright").Page} page
 */
async function pressEscapeWithRepeat(page) {
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", repeat: true, bubbles: true }),
    )
  })
}

/**
 * @param {import("playwright").Page} page
 */
async function assertReducedMotionStyles(page) {
  await page.getByRole("button", { name: "Start driving" }).waitFor()

  const styles = await page.evaluate(() => {
    const startButton = document.querySelector(".overlay button")

    if (!(startButton instanceof HTMLElement)) {
      return null
    }

    return {
      startButtonTransition: getComputedStyle(startButton).transitionDuration,
    }
  })

  if (!styles) {
    throw new Error("Expected reduced-motion style targets to exist")
  }

  if (styles.startButtonTransition !== "0s") {
    throw new Error(`Reduced-motion styles were not applied: ${JSON.stringify(styles)}`)
  }
}

/**
 * @param {import("playwright").Page} page
 */
async function assertFontPreload(page) {
  const fontPreload = await page
    .locator('link[rel="preload"][href="/fonts/space-grotesk-latin.woff2"][as="font"]')
    .getAttribute("type")

  if (fontPreload !== "font/woff2") {
    throw new Error(`Expected Space Grotesk font preload, got ${fontPreload}`)
  }
}

/**
 * @param {import("playwright").Page} page
 */
async function assertDocumentMetadata(page) {
  const metadata = await page.evaluate(() => ({
    description: document.querySelector('meta[name="description"]')?.getAttribute("content"),
    ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute("content"),
    themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
    title: document.title,
    viewport: document.querySelector('meta[name="viewport"]')?.getAttribute("content"),
  }))

  if (
    metadata.title !== "Liminal Drift" ||
    metadata.ogTitle !== "Liminal Drift" ||
    metadata.themeColor !== "#f7d6cb" ||
    !metadata.description?.includes("dreamcore 3D racing game") ||
    !metadata.viewport?.includes("viewport-fit=cover")
  ) {
    throw new Error(`Unexpected document metadata: ${JSON.stringify(metadata)}`)
  }
}

const browser = await chromium.launch()

try {
  {
    const context = await browser.newContext()
    const page = await context.newPage()

    await delaySceneChunk(page)
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          throw new DOMException("localStorage is unavailable", "SecurityError")
        },
      })
    })
    await page.goto(url, { waitUntil: "domcontentloaded" })
    await assertFontPreload(page)
    await assertDocumentMetadata(page)
    await assertStartupLoadingSequence(page)
    await assertModalDialog(page, "Start race")
    await assertActiveButton(page, "Start driving")
    await assertDialogTabWrap(page, "Start driving", "Start driving")
    await page.locator("canvas").waitFor()
    await assertAmbientGameHidden(page, true)
    await page.getByRole("button", { name: "Start driving" }).click()
    await assertAmbientGameHidden(page, false)
    await context.close()

    console.log("blocked storage ok")
  }

  {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.addInitScript(() => {
      window.localStorage.setItem("liminal-drift:best-score", "-12")
    })
    await page.goto(url, { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "Start driving" }).click()
    await page.locator("canvas").waitFor()

    const bestText = await page.locator(".hud__cluster--primary small").innerText()

    if (bestText !== "Recorded 0") {
      throw new Error(`Expected invalid negative best score to clamp to 0, got "${bestText}"`)
    }

    await context.close()

    console.log("invalid best score ok")
  }

  {
    const context = await browser.newContext({ reducedMotion: "reduce" })
    const page = await context.newPage()

    await page.goto(url, { waitUntil: "domcontentloaded" })
    await assertReducedMotionStyles(page)
    await context.close()

    console.log("reduced motion ok")
  }

  for (const viewport of viewports) {
    const context = await browser.newContext(viewport.options)
    const page = await context.newPage()

    await page.goto(url, { waitUntil: "domcontentloaded" })

    if (viewport.name === "mobile") {
      await assertDesktopRequired(page)

      await page.screenshot({
        path: join(outputPath, `${viewport.name}.png`),
        fullPage: true,
      })

      await context.close()

      console.log("mobile desktop-required ok")
      continue
    }

    await assertModalDialog(page, "Start race")
    await assertActiveButton(page, "Start driving")
    await assertDialogTabWrap(page, "Start driving", "Start driving")
    await assertControlLegend(page)
    await page.getByRole("button", { name: "Start driving" }).click()
    await page.locator("canvas").waitFor()
    await assertAmbientGameHidden(page, false)
    await page.getByRole("button", { name: "Pause" }).waitFor()
    await page.waitForTimeout(700)
    const beforeMotion = await screenshotCanvas(page)

    await page.keyboard.down("w")

    await page.waitForTimeout(2600)

    const telemetryLines = (await page.locator(".hud").innerText())
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    const telemetry = {
      speed: readMetric(telemetryLines, "Speed"),
      distance: readMetric(telemetryLines, "Distance"),
    }
    const progressValues = {
      checkpoint: await readProgressValue(page, "Checkpoint progress"),
      driftCharge: await readProgressValue(page, "Drift charge"),
      integrity: await readProgressValue(page, "Vehicle integrity"),
    }
    const hudText = (await page.locator(".hud").innerText()).toLowerCase()

    if (telemetry.speed <= 0 || telemetry.distance <= 0) {
      throw new Error(`${viewport.name} telemetry did not advance: ${JSON.stringify(telemetry)}`)
    }

    if (!hudText.includes("integrity") || !hudText.includes("drift") || !hudText.includes("exit")) {
      throw new Error(`${viewport.name} HUD meter labels were not visible: ${hudText}`)
    }

    if (
      progressValues.checkpoint < 0 ||
      progressValues.checkpoint > 100 ||
      progressValues.integrity < 0 ||
      progressValues.integrity > 100 ||
      progressValues.driftCharge < 0 ||
      progressValues.driftCharge > 100
    ) {
      throw new Error(
        `${viewport.name} progress values are out of range: ${JSON.stringify(progressValues)}`,
      )
    }

    await page.screenshot({
      path: join(outputPath, `${viewport.name}.png`),
      fullPage: true,
    })

    const screenshot = await page.screenshot()
    const afterMotion = await screenshotCanvas(page)
    const sample = samplePng(screenshot)
    const sceneDifference = measureSceneDifference(beforeMotion, afterMotion)
    const peripheralDifference = measurePeripheralDifference(beforeMotion, afterMotion)

    if (!sample.ok) {
      throw new Error(`${viewport.name} canvas check failed: ${JSON.stringify(sample)}`)
    }

    if (sceneDifference < 2) {
      throw new Error(`${viewport.name} scene did not visibly move: ${sceneDifference.toFixed(2)}`)
    }

    if (peripheralDifference < 1.6) {
      throw new Error(
        `${viewport.name} peripheral scenery did not visibly move: ${peripheralDifference.toFixed(
          2,
        )}`,
      )
    }

    await page.keyboard.up("w")

    await pressEscapeWithRepeat(page)
    await assertModalDialog(page, "Paused")
    await assertActiveButton(page, "Resume")
    await assertDialogTabWrap(page, "Resume", "Restart")
    await assertAmbientGameHidden(page, true)

    await context.close()

    console.log(`${viewport.name} canvas ok`, {
      ...sample,
      progressValues,
      peripheralDifference,
      sceneDifference,
      telemetry,
    })
  }
} finally {
  await browser.close()
}
