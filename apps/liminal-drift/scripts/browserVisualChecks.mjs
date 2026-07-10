import { PNG } from "pngjs"

/**
 * @param {Buffer | Uint8Array} buffer
 */
export function samplePng(buffer) {
  const png = PNG.sync.read(buffer)
  const points = Array.from({ length: 9 }, (_, yIndex) =>
    Array.from({ length: 9 }, (_, xIndex) => ({
      xRatio: 0.15 + ((xIndex + 0.5) / 9) * 0.7,
      yRatio: 0.32 + ((yIndex + 0.5) / 9) * 0.44,
    })),
  ).flat()
  const colors = points.map(({ xRatio, yRatio }) => {
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

/**
 * @param {import("playwright").Page} page
 */
export async function screenshotCanvas(page) {
  const box = await page.locator("canvas").boundingBox()

  if (!box) {
    throw new Error("Expected canvas bounds to be available")
  }

  return page.screenshot({ clip: box })
}

/**
 * @param {Buffer | Uint8Array} beforeBuffer
 * @param {Buffer | Uint8Array} afterBuffer
 */
export function measureSceneDifference(beforeBuffer, afterBuffer) {
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

/**
 * @param {Buffer | Uint8Array} beforeBuffer
 * @param {Buffer | Uint8Array} afterBuffer
 */
export function measurePeripheralDifference(beforeBuffer, afterBuffer) {
  const before = PNG.sync.read(beforeBuffer)
  const after = PNG.sync.read(afterBuffer)

  if (before.width !== after.width || before.height !== after.height) {
    throw new Error("Cannot compare screenshots with different dimensions")
  }

  const regions = [
    { xStart: 0.04, xEnd: 0.28, yStart: 0.34, yEnd: 0.82 },
    { xStart: 0.72, xEnd: 0.96, yStart: 0.34, yEnd: 0.82 },
  ]
  let totalDifference = 0
  let sampleCount = 0

  for (const region of regions) {
    const xStart = Math.floor(before.width * region.xStart)
    const xEnd = Math.floor(before.width * region.xEnd)
    const yStart = Math.floor(before.height * region.yStart)
    const yEnd = Math.floor(before.height * region.yEnd)

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
  }

  return sampleCount > 0 ? totalDifference / sampleCount : 0
}
