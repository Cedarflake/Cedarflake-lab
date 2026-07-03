import { chromium, devices } from "playwright"

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

const browser = await chromium.launch()
let speed = 0
let distance = 0

try {
  {
    const context = await browser.newContext({ ...devices["Pixel 7"] })
    const page = await context.newPage()

    await page.goto(url, { waitUntil: "domcontentloaded" })
    const hiddenGoButtonCount = await page.getByRole("button", { name: "Go" }).count()

    if (hiddenGoButtonCount > 0) {
      throw new Error("Expected touch controls to stay hidden before the race starts")
    }

    await page.getByRole("button", { name: "Start driving" }).click()
    await page.locator("canvas").waitFor()
    await page.waitForTimeout(500)

    const goButton = page.getByRole("button", { name: "Go" })
    const box = await goButton.boundingBox()

    if (!box) {
      throw new Error("Expected Go button to be visible")
    }

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()

    const pressedClass = await goButton.evaluate((button) =>
      button.classList.contains("touch-controls__button--pressed"),
    )

    if (!pressedClass) {
      throw new Error("Expected Go button to remain visually pressed while held")
    }

    await page.waitForTimeout(1600)

    const text = await page.locator("body").innerText()
    speed = readMetric(text, "SPEED")
    distance = readMetric(text, "DISTANCE")

    await page.keyboard.press("Escape")
    const pausedDialog = page.getByRole("dialog", { name: "Paused" })
    await pausedDialog.waitFor()
    const pausedText = await pausedDialog.innerText()
    const normalizedPausedText = pausedText.toLowerCase()

    if (!normalizedPausedText.includes("top speed") || !normalizedPausedText.includes("exits")) {
      throw new Error("Expected paused stats to include run highlights")
    }

    await page.getByRole("button", { name: "Resume" }).click()
    await page.waitForTimeout(1000)

    const resumedText = await page.locator("body").innerText()
    const resumedSpeed = readMetric(resumedText, "SPEED")

    if (resumedSpeed > speed + 5) {
      throw new Error(`Expected touch input to reset on pause, got ${speed} -> ${resumedSpeed}`)
    }

    await context.close()
  }

  {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto(url, { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "Start driving" }).click()
    await page.locator("canvas").waitFor()
    await page.keyboard.down("w")
    await page.waitForTimeout(700)
    await page.keyboard.down("d")
    await page.keyboard.down("Space")
    await page.waitForTimeout(2200)

    const text = await page.locator("body").innerText()
    const keyboardSpeed = readMetric(text, "SPEED")
    const driftCharge = await readProgressValue(page, "Drift charge")

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
} finally {
  await browser.close()
}

if (speed <= 0 || distance <= 0) {
  throw new Error(`Expected touch driving to advance, got speed=${speed} distance=${distance}`)
}

console.log("interaction ok", { speed, distance })
