import { readdir, readFile, stat } from "node:fs/promises"
import { basename, join } from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"

const distAssetsPath = new URL("../dist/assets/", import.meta.url)
const distAssetsFilePath = fileURLToPath(distAssetsPath)
const kib = 1024
const budgets = {
  cssGzipBytes: 12 * kib,
  largestAssetBytes: 780 * kib,
  totalJsGzipBytes: 360 * kib,
}

/**
 * @param {number} bytes
 */
function formatKib(bytes) {
  return `${(bytes / kib).toFixed(1)} KiB`
}

/**
 * @param {number} actual
 * @param {number} limit
 * @param {string} label
 */
function assertBudget(actual, limit, label) {
  if (actual > limit) {
    throw new Error(`${label} exceeded budget: ${formatKib(actual)} > ${formatKib(limit)}`)
  }
}

const assetNames = await readdir(distAssetsPath)
const assetReports = await Promise.all(
  assetNames
    .filter((assetName) => assetName.endsWith(".js") || assetName.endsWith(".css"))
    .map(async (assetName) => {
      const assetPath = join(distAssetsFilePath, assetName)
      const assetStat = await stat(assetPath)
      const assetBuffer = await readFile(assetPath)

      return {
        name: basename(assetName),
        rawBytes: assetStat.size,
        gzipBytes: gzipSync(assetBuffer).byteLength,
      }
    }),
)

const jsReports = assetReports.filter((report) => report.name.endsWith(".js"))
const cssReports = assetReports.filter((report) => report.name.endsWith(".css"))
const totalJsGzipBytes = jsReports.reduce((total, report) => total + report.gzipBytes, 0)
const totalCssGzipBytes = cssReports.reduce((total, report) => total + report.gzipBytes, 0)
const largestAsset = assetReports.reduce(
  (largest, report) => (report.rawBytes > largest.rawBytes ? report : largest),
  { name: "", rawBytes: 0, gzipBytes: 0 },
)

assertBudget(totalJsGzipBytes, budgets.totalJsGzipBytes, "Total JS gzip size")
assertBudget(totalCssGzipBytes, budgets.cssGzipBytes, "Total CSS gzip size")
assertBudget(largestAsset.rawBytes, budgets.largestAssetBytes, "Largest asset raw size")

console.log("bundle budget ok", {
  largestAsset: {
    gzip: formatKib(largestAsset.gzipBytes),
    name: largestAsset.name,
    raw: formatKib(largestAsset.rawBytes),
  },
  totalCssGzip: formatKib(totalCssGzipBytes),
  totalJsGzip: formatKib(totalJsGzipBytes),
})
