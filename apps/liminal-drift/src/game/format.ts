const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })
const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  notation: "compact",
})

const racerCompactThreshold = 10_000
const scoreCompactThreshold = 10_000_000

function formatCompactAbove(value: number, threshold: number) {
  if (Math.abs(value) < threshold) {
    return numberFormatter.format(value)
  }

  return compactNumberFormatter.format(value)
}

export function formatNumber(value: number) {
  return numberFormatter.format(value)
}

export function formatRacerNumber(value: number) {
  return formatCompactAbove(value, racerCompactThreshold)
}

export function formatScoreNumber(value: number) {
  return formatCompactAbove(value, scoreCompactThreshold)
}
