import assert from "node:assert/strict";
import test from "node:test";
import { buildIntelligenceContextBudget, boundRecentConversation } from "../lib/operator/runtime/IntelligenceContextBudgetRuntime.js";

test("fast context stays bounded as account history grows", () => {
  const conversation = Array.from({ length: 500 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `turn-${index} ${"x".repeat(1500)}` }));
  const memories = Array.from({ length: 500 }, (_, index) => ({ type: "decision", content: `memory-${index} ${"y".repeat(1200)}` }));
  const context = buildIntelligenceContextBudget({ conversation, longTermMemory: memories, projectState: { objective: "Keep the investor film calm", decisions: Array.from({ length: 30 }, (_, i) => `decision ${i}`) } });
  assert.equal(context.contract, "AVANTIQO_INTELLIGENCE_CONTEXT_BUDGET_V1");
  assert.ok(context.telemetry.recent_turns <= 8);
  assert.ok(context.telemetry.recent_chars <= 7200);
  assert.ok(context.telemetry.memory_items <= 6);
  assert.ok(context.telemetry.memory_chars <= 5200);
});

test("recent conversation preserves newest turns without requiring a new visible chat", () => {
  const result = boundRecentConversation(Array.from({ length: 40 }, (_, index) => ({ role: "user", content: `message ${index}` })));
  assert.equal(result.at(-1).content, "message 39");
  assert.ok(result.length <= 8);
  assert.equal(result.some((entry) => entry.content === "message 0"), false);
});

test("project checkpoint carries durable decisions when raw turns roll off", () => {
  const context = buildIntelligenceContextBudget({ conversation: [], projectState: { objective: "World-class Avantiqo film", decisions: ["Slow pacing", "Same helicopter continuity"], constraints: ["No rapid montage"], next_step: "Develop reveal" } });
  assert.equal(context.project_checkpoint.objective, "World-class Avantiqo film");
  assert.deepEqual(context.project_checkpoint.decisions, ["Slow pacing", "Same helicopter continuity"]);
  assert.equal(context.project_checkpoint.next_step, "Develop reveal");
});
