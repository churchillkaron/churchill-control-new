import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIntelligenceContextBudget,
} from "../lib/operator/runtime/IntelligenceContextBudgetRuntime.js";

function conversation(turns) {
  return Array.from({ length: turns }, (_, index) => ({
    role: index % 2 ? "assistant" : "user",
    content: `${index}:` + "x".repeat(900),
  }));
}

function memories(items) {
  return Array.from({ length: items }, (_, index) => ({
    id: `m-${index}`,
    content: `${index}:` + "m".repeat(700),
  }));
}
test("five years of history costs the same prompt footprint as recent bounded history", () => {
  const recent = buildIntelligenceContextBudget({
    conversation: conversation(16),
    longTermMemory: memories(12),
    lane: "fast",
  });
  const historic = buildIntelligenceContextBudget({
    conversation: conversation(5000),
    longTermMemory: memories(5000),
    lane: "fast",
  });

  assert.equal(historic.telemetry.recent_turns, recent.telemetry.recent_turns);
  assert.equal(historic.telemetry.recent_chars, recent.telemetry.recent_chars);
  assert.equal(historic.telemetry.memory_items, recent.telemetry.memory_items);
  assert.equal(historic.telemetry.memory_chars, recent.telemetry.memory_chars);
  assert.equal(historic.telemetry.estimated_input_tokens, recent.telemetry.estimated_input_tokens);
  assert.ok(historic.telemetry.estimated_input_tokens <= 4000);
});

test("deep history is bounded independently of archive size", () => {
  const result = buildIntelligenceContextBudget({ conversation: conversation(10000), longTermMemory: memories(10000), lane: "deep" });
  assert.ok(result.telemetry.recent_turns <= 12);
  assert.ok(result.telemetry.recent_chars <= 12000);
  assert.ok(result.telemetry.memory_items <= 10);
  assert.ok(result.telemetry.memory_chars <= 9000);
});