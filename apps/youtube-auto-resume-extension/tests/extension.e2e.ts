import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { chromium } from "playwright";

const extensionDirectory = resolve(import.meta.dirname, "../dist/chromium");

test("Chromium loads the unpacked extension and injects its runtime", async () => {
  const userDataDirectory = await mkdtemp(
    join(tmpdir(), "youtube-auto-resume-extension-"),
  );
  const context = await chromium.launchPersistentContext(userDataDirectory, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionDirectory}`,
      `--load-extension=${extensionDirectory}`,
    ],
  });

  try {
    const page = await context.newPage();
    await page.route("https://www.youtube.com/**", async (route) => {
      await route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: "<!doctype html><html><head><title>Fixture</title></head><body></body></html>",
      });
    });
    await page.goto("https://www.youtube.com/watch?v=extension-fixture");
    await page.locator("#auto-chick-yt-auto-resume-host").waitFor({
      state: "attached",
    });

    assert.equal(
      await page
        .locator("html")
        .getAttribute("data-cedarflake-youtube-auto-resume-extension"),
      "active",
    );
  } finally {
    await context.close();
    await rm(userDataDirectory, { recursive: true, force: true });
  }
});
