import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { chromium, devices } from "playwright"
import { PNG } from "pngjs"

const url = process.argv.find((value) => value.startsWith("http")) ?? "http://localhost:5173/"
const outputDir = new URL("../artifacts/", import.meta.url)
const outputPath = fileURLToPath(outputDir)

await mkdir(outputDir, { recursive: true })

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

function samplePng(buffer) {
  const png = PNG.sync.read(buffer)
  const points = Array.from({ length: 9 }, (_, yIndex) =>
    Array.from({ length: 9 }, (_, xIndex) => [
      0.15 + ((xIndex + 0.5) / 9) * 0.7,
      0.32 + ((yIndex + 0.5) / 9) * 0.44,
    ]),
  ).flat()
  const colors = points.map(([xRatio, yRatio]) => {
    const x = Math.floor(png.width * xRatio)
    const y = Math.floor(png.height * yRatio)
    const index = (png.width * y + x) * 4

    return {
      color: [
        png.data[index] ?? 0,
        png.data[index + 1] ?? 0,
        png.data[index + 2] ?? 0,
        png.data[index + 3] ?? 0,
      ].join(","),
      luminance:
        (png.data[index] ?? 0) * 0.2126 +
        (png.data[index + 1] ?? 0) * 0.7152 +
        (png.data[index + 2] ?? 0) * 0.0722,
      yRatio,
    }
  })
  const uniqueColors = new Set(colors.map((sample) => sample.color))
  const luminanceValues = colors.map((sample) => sample.luminance)
  const minLuminance = Math.min(...luminanceValues)
  const maxLuminance = Math.max(...luminanceValues)
  const hasVisiblePixels = colors.some(
    (sample) => sample.color !== "0,0,0,0" && sample.color !== "0,0,0,255",
  )
  const hasSceneContrast = maxLuminance - minLuminance > 8 || minLuminance < 242

  return {
    ok: hasVisiblePixels && uniqueColors.size > 18 && hasSceneContrast,
    colors: colors.slice(0, 8).map((sample) => sample.color),
    hasSceneContrast,
    minLuminance,
    maxLuminance,
    uniqueColorCount: uniqueColors.size,
    width: png.width,
    height: png.height,
  }
}

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

function measureSceneDifference(beforeBuffer, afterBuffer) {
  const before = PNG.sync.read(beforeBuffer)
  const after = PNG.sync.read(afterBuffer)

  if (before.width !== after.width || before.height !== after.height) {
    throw new Error("Cannot compare screenshots with different dimensions")
  }

  const xStart = Math.floor(before.width * 0.16)
  const xEnd = Math.floor(before.width * 0.84)
  const yStart = Math.floor(before.height * 0.32)
  const yEnd = Math.floor(before.height * 0.86)
  let totalDifference = 0
  let sampleCount = 0

  for (let y = yStart; y < yEnd; y += 8) {
    for (let x = xStart; x < xEnd; x += 8) {
      const index = (before.width * y + x) * 4
      totalDifference +=
        Math.abs((before.data[index] ?? 0) - (after.data[index] ?? 0)) +
        Math.abs((before.data[index + 1] ?? 0) - (after.data[index + 1] ?? 0)) +
        Math.abs((before.data[index + 2] ?? 0) - (after.data[index + 2] ?? 0))
      sampleCount += 1
    }
  }

  return sampleCount > 0 ? totalDifference / sampleCount : 0
}

const browser = await chromium.launch()

try {
  {
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          throw new DOMException("localStorage is unavailable", "SecurityError")
        },
      })
    })
    await page.goto(url, { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "Start driving" }).click()
    await page.locator("canvas").waitFor()
    await context.close()

    console.log("blocked storage ok")
  }

  for (const viewport of viewports) {
    const context = await browser.newContext(viewport.options)
    const page = await context.newPage()

    await page.goto(url, { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "Start driving" }).click()
    await page.locator("canvas").waitFor()
    await page.getByRole("button", { name: "Pause" }).waitFor()
    await page.waitForTimeout(700)
    const beforeMotion = await page.locator("canvas").screenshot()

    if (viewport.name === "mobile") {
      const goButton = page.getByRole("button", { name: "Go" })
      const box = await goButton.boundingBox()

      if (!box) {
        throw new Error("Expected Go button to be visible")
      }

      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
    } else {
      await page.keyboard.down("w")
    }

    await page.waitForTimeout(2600)

    const telemetryLines = (await page.locator(".hud").innerText())
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    const telemetry = {
      speed: readMetric(telemetryLines, "Speed"),
      distance: readMetric(telemetryLines, "Distance"),
    }

    if (telemetry.speed <= 0 || telemetry.distance <= 0) {
      throw new Error(`${viewport.name} telemetry did not advance: ${JSON.stringify(telemetry)}`)
    }

    await page.screenshot({
      path: join(outputPath, `${viewport.name}.png`),
      fullPage: true,
    })

    const screenshot = await page.screenshot()
    const afterMotion = await page.locator("canvas").screenshot()
    const sample = samplePng(screenshot)
    const sceneDifference = measureSceneDifference(beforeMotion, afterMotion)

    await context.close()

    if (!sample.ok) {
      throw new Error(`${viewport.name} canvas check failed: ${JSON.stringify(sample)}`)
    }

    if (sceneDifference < 2) {
      throw new Error(`${viewport.name} scene did not visibly move: ${sceneDifference.toFixed(2)}`)
    }

    console.log(`${viewport.name} canvas ok`, { ...sample, sceneDifference, telemetry })
  }
} finally {
  await browser.close()
}
