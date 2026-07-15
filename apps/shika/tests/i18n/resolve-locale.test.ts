import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveRequestLocale } from "../../src/i18n/resolve-locale";

describe("request locale resolution", () => {
  it("lets a valid locale cookie override the browser preference", () => {
    assert.equal(resolveRequestLocale("en", "zh-CN,zh;q=0.9"), "en");
    assert.equal(resolveRequestLocale("zh-CN", "en-US,en;q=0.9"), "zh-CN");
  });

  it("falls back to the weighted browser language when the cookie is invalid", () => {
    assert.equal(
      resolveRequestLocale("fr", "en-US;q=0.7,zh-Hans-CN;q=0.9"),
      "zh-CN",
    );
    assert.equal(resolveRequestLocale(null, "zh-CN;q=0.5,en;q=0.8"), "en");
  });

  it("supports English and Simplified Chinese language variants", () => {
    assert.equal(resolveRequestLocale(null, "en-GB"), "en");
    assert.equal(resolveRequestLocale(null, "zh"), "zh-CN");
    assert.equal(resolveRequestLocale(null, "zh-SG"), "zh-CN");
    assert.equal(resolveRequestLocale(null, "zh-Hans"), "zh-CN");
  });

  it("does not silently map Traditional Chinese to Simplified Chinese", () => {
    assert.equal(resolveRequestLocale(null, "zh-Hant-TW"), "en");
    assert.equal(resolveRequestLocale(null, "zh-TW,zh;q=0.8"), "zh-CN");
  });

  it("ignores malformed, disabled, and wildcard preferences", () => {
    assert.equal(
      resolveRequestLocale(null, "fr;q=1,en;q=oops,zh-CN;q=0,*;q=0.8"),
      "en",
    );
  });

  it("uses English when no supported preference is available", () => {
    assert.equal(resolveRequestLocale(null, null), "en");
    assert.equal(resolveRequestLocale(null, "fr-FR,de;q=0.8"), "en");
  });
});
