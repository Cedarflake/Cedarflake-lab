import assert from "node:assert/strict"
import test from "node:test"

import {
  createSettingsStore,
  DEFAULT_SETTINGS,
  normalizeSettings,
} from "../src/core/settings.ts"

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>()

  get length(): number {
    return this.#values.size
  }

  clear(): void {
    this.#values.clear()
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.#values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.#values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value)
  }
}

test("normalizeSettings applies defaults and clamps numeric input", () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS)

  const settings = normalizeSettings({
    autoSkipAds: 1,
    intervalMs: 1,
    minPausedSeconds: 100,
  })

  assert.equal(settings.autoSkipAds, true)
  assert.equal(settings.intervalMs, 200)
  assert.equal(settings.minPausedSeconds, 30)
})

test("legacy hidden-panel state cannot suppress the launcher", () => {
  const settings = normalizeSettings({
    ...DEFAULT_SETTINGS,
    showPanel: false,
  })

  assert.equal("showPanel" in settings, false)
  assert.equal(settings.collapsed, true)
})

test("settings store persists normalized values", () => {
  const storage = new MemoryStorage()
  const store = createSettingsStore({
    prefix: "test.",
    storage,
  })

  const saved = store.save({
    ...DEFAULT_SETTINGS,
    intervalMs: 20_000,
  })

  assert.equal(saved.intervalMs, 10_000)
  assert.equal(store.reload().intervalMs, 10_000)
  assert.equal(JSON.parse(storage.getItem(store.key) ?? "null").intervalMs, 10_000)
})

test("settings store recovers from invalid JSON", () => {
  const storage = new MemoryStorage()
  storage.setItem("broken.settings", "{")

  const store = createSettingsStore({
    prefix: "broken.",
    storage,
  })

  assert.deepEqual(store.get(), DEFAULT_SETTINGS)
})
