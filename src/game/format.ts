const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

export function formatNumber(value: number) {
  return numberFormatter.format(value)
}
