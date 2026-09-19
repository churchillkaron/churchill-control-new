import assert from "node:assert/strict";
import test from "node:test";
import { intelligenceMemoryTemperature } from "../lib/operator/runtime/IntelligenceMemoryTemperaturePolicy.js";

test("important durable decisions stay hot", () => {
  assert.equal(intelligenceMemoryTemperature({ memory_type: "decision", importance: 0.8, updated_at: new Date().toISOString() }), "HOT");
});

test("old low-importance mutable facts become cold", () => {
  const old = new Date(Date.now() - 400 * 86400000).toISOString();
  assert.equal(intelligenceMemoryTemperature({ memory_type: "fact", importance: 0.2, updated_at: old }), "COLD");
});

test("preferences remain warm even when not recent", () => {
  const old = new Date(Date.now() - 500 * 86400000).toISOString();
  assert.equal(intelligenceMemoryTemperature({ memory_type: "preference", importance: 0.5, updated_at: old }), "WARM");
});
