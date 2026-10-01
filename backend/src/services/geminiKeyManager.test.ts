import test from "node:test";
import assert from "node:assert/strict";
import { geminiKeyManager } from "./geminiKeyManager.js";

test("GeminiKeyManager - multi-account pool initialization", async (t) => {
  await t.test("initializes with user-provided keys", () => {
    const status = geminiKeyManager.getKeyPoolStatus();
    assert.ok(status.length >= 3, "Expected at least 3 keys in the pool");
  });

  await t.test("masks keys to protect credentials from leaking in logs", () => {
    const status = geminiKeyManager.getKeyPoolStatus();
    for (const item of status) {
      assert.ok(item.masked.includes("..."), "Key should be masked with ellipsis");
      assert.ok(item.masked.length <= 20, "Full key should not be exposed");
      assert.strictEqual(item.isAvailable, true, "Key should be available initially");
    }


  });

  await t.test("reports health stats for all keys", () => {
    const status = geminiKeyManager.getKeyPoolStatus();
    for (const item of status) {
      assert.strictEqual(typeof item.index, "number");
      assert.strictEqual(typeof item.successCount, "number");
      assert.strictEqual(typeof item.failureCount, "number");
      assert.strictEqual(typeof item.cooldownRemainingSec, "number");
    }
  });
});
