export const SETTINGS_STORAGE_PREFIX = "autoChick.ytAutoResume."

export const QUALITY_PREFERENCES = [
  "auto",
  "hd4320",
  "hd2880",
  "hd2160",
  "hd1440",
  "hd1080",
  "hd720",
  "large",
  "medium",
  "small",
  "tiny",
] as const

export type QualityPreference = typeof QUALITY_PREFERENCES[number]

export interface YouTubeAutoResumeSettings {
  enabled: boolean
  intervalMs: number
  minPausedSeconds: number
  autoSkipAds: boolean
  preferredQuality: QualityPreference
  avoidTyping: boolean
  avoidEnded: boolean
  collapsed: boolean
}

export type Settings = YouTubeAutoResumeSettings

export interface SettingsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface SettingsStoreOptions {
  storage?: SettingsStorage
  prefix?: string
}

export interface SettingsStore {
  readonly key: string
  get(): YouTubeAutoResumeSettings
  reload(): YouTubeAutoResumeSettings
  save(next: unknown): SettingsSaveResult
}

export interface SettingsSaveResult {
  persisted: boolean
  settings: YouTubeAutoResumeSettings
}

export const DEFAULT_SETTINGS: Readonly<YouTubeAutoResumeSettings> = {
  enabled: true,
  intervalMs: 1000,
  minPausedSeconds: 2,
  autoSkipAds: false,
  preferredQuality: "auto",
  avoidTyping: true,
  avoidEnded: true,
  collapsed: true,
}

interface UnknownRecord {
  [key: string]: unknown
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readBoolean(
  source: UnknownRecord,
  key: keyof YouTubeAutoResumeSettings,
  fallback: boolean,
): boolean {
  return key in source ? Boolean(source[key]) : fallback
}

export function isQualityPreference(
  value: unknown,
): value is QualityPreference {
  return QUALITY_PREFERENCES.includes(value as QualityPreference)
}

export function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return fallback
  }

  return Math.min(max, Math.max(min, numericValue))
}

export function normalizeSettings(input: unknown): YouTubeAutoResumeSettings {
  const source = isRecord(input) ? input : {}

  return {
    enabled: readBoolean(source, "enabled", DEFAULT_SETTINGS.enabled),
    intervalMs: Math.round(
      clampNumber(source.intervalMs, 200, 10000, DEFAULT_SETTINGS.intervalMs),
    ),
    minPausedSeconds: clampNumber(
      source.minPausedSeconds,
      0,
      30,
      DEFAULT_SETTINGS.minPausedSeconds,
    ),
    autoSkipAds: readBoolean(
      source,
      "autoSkipAds",
      DEFAULT_SETTINGS.autoSkipAds,
    ),
    preferredQuality: isQualityPreference(source.preferredQuality)
      ? source.preferredQuality
      : DEFAULT_SETTINGS.preferredQuality,
    avoidTyping: readBoolean(
      source,
      "avoidTyping",
      DEFAULT_SETTINGS.avoidTyping,
    ),
    avoidEnded: readBoolean(
      source,
      "avoidEnded",
      DEFAULT_SETTINGS.avoidEnded,
    ),
    collapsed: readBoolean(source, "collapsed", DEFAULT_SETTINGS.collapsed),
  }
}

export function createSettingsStore(
  options: SettingsStoreOptions = {},
): SettingsStore {
  const storage = options.storage ?? window.localStorage
  const prefix = options.prefix ?? SETTINGS_STORAGE_PREFIX
  const key = `${prefix}settings`
  let current = normalizeSettings(null)

  function loadRaw(): unknown {
    try {
      const raw = storage.getItem(key)

      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  function saveRaw(settings: YouTubeAutoResumeSettings): boolean {
    try {
      storage.setItem(key, JSON.stringify(settings))
      return true
    } catch {
      return false
    }
  }

  function reload(): YouTubeAutoResumeSettings {
    current = normalizeSettings(loadRaw())
    return current
  }

  function get(): YouTubeAutoResumeSettings {
    return current
  }

  function save(next: unknown): SettingsSaveResult {
    current = normalizeSettings(next)
    const persisted = saveRaw(current)
    return { persisted, settings: current }
  }

  reload()

  return { key, get, reload, save }
}
