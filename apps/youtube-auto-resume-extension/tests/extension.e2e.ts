import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"

import { chromium } from "playwright"

const extensionDirectory = resolve(import.meta.dirname, "../dist/chromium")

test("Chromium injects the runtime and dispatches opt-in trusted skip input", async () => {
  const userDataDirectory = await mkdtemp(
    join(tmpdir(), "youtube-auto-resume-extension-"),
  )
  const context = await chromium.launchPersistentContext(userDataDirectory, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionDirectory}`,
      `--load-extension=${extensionDirectory}`,
    ],
  })

  try {
    const page = await context.newPage()
    await page.route("https://www.youtube.com/**", async (route) => {
      await route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html>
          <html>
            <head><title>Fixture</title></head>
            <body>
              <div id="movie_player" style="position: relative; width: 640px; height: 360px;">
                <button
                  class="ytp-ad-skip-button-modern"
                  style="position: absolute; left: 440px; top: 240px; width: 140px; height: 48px;"
                >Skip ad</button>
              </div>
              <script>
                window.skipInputEvents = []
                document.querySelector(".ytp-ad-skip-button-modern")
                  .addEventListener("click", (event) => {
                    window.skipInputEvents.push({
                      detail: event.detail,
                      isTrusted: event.isTrusted,
                      type: event.type,
                    })
                  })
              </script>
            </body>
          </html>`,
      })
    })
    await page.goto("https://www.youtube.com/watch?v=extension-fixture")
    const host = page.locator("#auto-chick-yt-auto-resume-host")
    await host.waitFor({ state: "attached" })

    assert.equal(
      await page
        .locator("html")
        .getAttribute("data-cedarflake-youtube-auto-resume-extension"),
      "active",
    )
    await page.waitForTimeout(600)
    assert.deepEqual(
      await page.evaluate(() => Reflect.get(window, "skipInputEvents")),
      [],
    )

    await host.locator(".fab").click()
    await host.locator('label[for="auto-skip-ads"]').click()
    assert.equal(
      await page.getByRole("checkbox", { name: "自动跳过广告" }).isChecked(),
      true,
    )
    await page.waitForFunction(() => {
      const events = Reflect.get(window, "skipInputEvents")
      return Array.isArray(events) && events.length > 0
    }, null, { timeout: 5_000 })

    assert.deepEqual(
      await page.evaluate(() => Reflect.get(window, "skipInputEvents")),
      [{ detail: 1, isTrusted: true, type: "click" }],
    )
  } finally {
    await context.close()
    await rm(userDataDirectory, { recursive: true, force: true })
  }
})
