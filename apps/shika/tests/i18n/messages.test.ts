import assert from "node:assert/strict";
import { describe, it } from "node:test";

import enMessages from "../../src/messages/en.json";
import zhCnMessages from "../../src/messages/zh-CN.json";

function collectMessageKeys(value: unknown, path = ""): string[] {
  if (typeof value === "string") {
    assert.notEqual(value.trim(), "", `Message ${path} must not be empty`);
    return [path];
  }

  assert.ok(
    typeof value === "object" && value !== null && !Array.isArray(value),
    `Message group ${path || "<root>"} must contain strings or nested groups`,
  );

  return Object.entries(value)
    .flatMap(([key, child]) =>
      collectMessageKeys(child, path === "" ? key : `${path}.${key}`),
    )
    .sort();
}

describe("locale message catalogs", () => {
  it("keeps English and Simplified Chinese keys in exact parity", () => {
    assert.deepEqual(
      collectMessageKeys(zhCnMessages),
      collectMessageKeys(enMessages),
    );
  });
});
