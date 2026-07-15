const localDateTimePattern =
  /^([1-9]\d{3})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/

export function resolveUtcDateTimeSubmission(
  epochValue: string,
  localValue: string,
  timezone: string,
) {
  if (epochValue !== "") return epochValue
  if (localValue === "" || timezone !== "UTC") return ""

  const match = localDateTimePattern.exec(localValue)
  if (!match) return ""

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6] ?? "0")
  const millisecond = Number((match[7] ?? "0").padEnd(3, "0"))
  const timestamp = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond,
  )
  const parsed = new Date(timestamp)

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute ||
    parsed.getUTCSeconds() !== second ||
    parsed.getUTCMilliseconds() !== millisecond
  ) {
    return ""
  }

  return String(timestamp)
}
