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

const browser = await chromium.launch()
let speed = 0
let distance = 0

try {
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
  await page.waitForTimeout(1600)

  const text = await page.locator("body").innerText()
  speed = readMetric(text, "SPEED")
  distance = readMetric(text, "DISTANCE")

  await page.keyboard.press("Escape")
  await page.getByRole("dialog", { name: "Paused" }).waitFor()
  await page.getByRole("button", { name: "Resume" }).click()
  await page.waitForTimeout(1000)

  const resumedText = await page.locator("body").innerText()
  const resumedSpeed = readMetric(resumedText, "SPEED")

  if (resumedSpeed > speed + 5) {
    throw new Error(`Expected touch input to reset on pause, got ${speed} -> ${resumedSpeed}`)
  }
} finally {
  await browser.close()
}

if (speed <= 0 || distance <= 0) {
  throw new Error(`Expected touch driving to advance, got speed=${speed} distance=${distance}`)
}

console.log("interaction ok", { speed, distance })
