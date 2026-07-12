import assert from "node:assert/strict"
import test from "node:test"
import { resolve } from "node:path"

import { chromium } from "playwright"

const projectDirectory = resolve(import.meta.dirname, "..")
const userscriptPath = resolve(
  projectDirectory,
  "dist/youtube-auto-resume.user.js",
)
const hostId = "auto-chick-yt-auto-resume-host"

test("launcher remains visible and follows the active mount target", async () => {
  const browser = await chromium.launch({ headless: true })

  try {
    const context = await browser.newContext()
    await context.addInitScript(() => {
      localStorage.setItem(
        "autoChick.ytAutoResume.settings",
        JSON.stringify({
          collapsed: true,
          showPanel: false,
        }),
      )
    })

    const page = await context.newPage()
    await page.route("https://www.youtube.com/**", async (route) => {
      await route.fulfill({
        body: `<!doctype html>
          <html lang="zh-CN">
            <body>
              <main id="movie_player" class="html5-video-player">
                <video class="html5-main-video"></video>
              </main>
            </body>
          </html>`,
        contentType: "text/html",
        status: 200,
      })
    })

    await page.goto("https://www.youtube.com/watch?v=panel-fixture")
    await page.addScriptTag({ path: userscriptPath })

    const host = page.locator(`#${hostId}`)
    await host.waitFor({ state: "attached" })

    const launcher = page.getByRole("button", {
      name: "打开 YouTube Auto Resume 面板",
    })
    await launcher.waitFor({ state: "visible" })

    const launcherState = await launcher.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)

      return {
        height: rect.height,
        opacity: style.opacity,
        visibility: style.visibility,
        width: rect.width,
      }
    })

    assert.ok(launcherState.width >= 48)
    assert.ok(launcherState.height >= 48)
    assert.equal(launcherState.opacity, "1")
    assert.equal(launcherState.visibility, "visible")

    await launcher.click()
    await page.getByRole("dialog", { name: "YouTube Auto Resume" }).waitFor({
      state: "visible",
    })
    assert.equal(await launcher.isVisible(), false)

    await host.evaluate((element) => element.remove())
    await page.waitForFunction(
      (id) => document.getElementById(id)?.isConnected === true,
      hostId,
    )

    await page.evaluate((id) => {
      const fullscreenTarget = document.createElement("section")
      fullscreenTarget.id = id
      document.body.appendChild(fullscreenTarget)
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        value: fullscreenTarget,
      })
      document.dispatchEvent(new Event("fullscreenchange"))
    }, "fixture-fullscreen-target")
    await page.waitForFunction(
      (id) => document.fullscreenElement?.querySelector(`#${id}`) !== null,
      hostId,
    )

    await page.evaluate(() => {
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        value: null,
      })
      document.dispatchEvent(new Event("fullscreenchange"))
    })
    await page.waitForFunction(
      (id) => document.body.querySelector(`#${id}`) !== null,
      hostId,
    )

    await context.close()
  } finally {
    await browser.close()
  }
})
