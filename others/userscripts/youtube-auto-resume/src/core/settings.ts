export const SETTINGS_STORAGE_PREFIX = "autoChick.ytAutoResume."

export interface YouTubeAutoResumeSettings {
  enabled: boolean
  intervalMs: number
  minPausedSeconds: number
  autoSkipAds: boolean
  bestQuality: boolean
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
  save(next: unknown): YouTubeAutoResumeSettings
}

export const DEFAULT_SETTINGS: Readonly<YouTubeAutoResumeSettings> = {
  enabled: true,
  intervalMs: 1000,
  minPausedSeconds: 2,
  autoSkipAds: false,
  bestQuality: false,
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
    bestQuality: readBoolean(
      source,
      "bestQuality",
      DEFAULT_SETTINGS.bestQuality,
    ),
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

  function save(next: unknown): YouTubeAutoResumeSettings {
    current = normalizeSettings(next)
    saveRaw(current)
    return current
  }

  reload()

  return { key, get, reload, save }
}
