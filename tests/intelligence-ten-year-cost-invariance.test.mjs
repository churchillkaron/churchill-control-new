import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildIntelligenceContextBudget } from "../lib/operator/runtime/IntelligenceContextBudgetRuntime.js";
import { memoryRecallCandidateLimit } from "../lib/operator/runtime/IntelligenceMemoryGovernorPolicy.js";

function conversation(count) {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 ? "assistant" : "user",
    content: "bounded-conversation-" + "x".repeat(280),
  }));
}

function memories(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `memory-${index}`,
    content: "durable-memory-" + "m".repeat(260),
  }));
}

const projectState = {
  objective: "Long running project continuity",
  decisions: Array(400).fill("Preserve durable decision"),
  constraints: Array(400).fill("Preserve durable constraint"),
  completed_steps: Array(400).fill("Historic completed step"),
  progress_summary: "p".repeat(5000),
  creative_context: { nested: Array(100).fill({ note: "c".repeat(400) }) },
};test("ten years of active use keeps prompt footprint constant", () => {
  const recent = buildIntelligenceContextBudget({
    conversation: conversation(20),
    longTermMemory: memories(20),
    projectState,
    lane: "fast",
  });
  const decade = buildIntelligenceContextBudget({
    conversation: conversation(36500),
    longTermMemory: memories(36500),
    projectState,
    lane: "fast",
  });

  assert.equal(decade.telemetry.estimated_input_tokens, recent.telemetry.estimated_input_tokens);
  assert.equal(decade.telemetry.estimated_context_bytes, recent.telemetry.estimated_context_bytes);
  assert.ok(decade.telemetry.recent_turns <= 8);
  assert.ok(decade.telemetry.memory_items <= 6);
  assert.ok(decade.telemetry.estimated_input_tokens <= 5000);
});

test("recall work stays globally bounded regardless of lifetime memory rows", () => {
  assert.equal(memoryRecallCandidateLimit(1), 100);
  assert.equal(memoryRecallCandidateLimit(2), 100);
  assert.equal(memoryRecallCandidateLimit(3), 66);
  assert.ok(memoryRecallCandidateLimit(3) * 3 <= 200);
});test("recall hydration and telemetry writes stay fixed-size", () => {
  const runtime = fs.readFileSync("lib/operator/runtime/IntelligenceMemoryRuntime.js", "utf8");
  assert.match(runtime, /select\("id,metadata"\)/);
  assert.match(runtime, /Math\.min\(MAX_RECALL, Number\(limit\) \|\| MAX_RECALL\)/);
  assert.match(runtime, /\.slice\(0, 3\)/);
  assert.doesNotMatch(runtime, /select\([^\n]*metadata[^\n]*\)[\s\S]{0,500}\.limit\(candidateLimit\)/);
});

test("observability and structural learning stores remain bounded", () => {
  const observability = fs.readFileSync("lib/operator/runtime/IntelligenceMemoryObservabilityRuntime.js", "utf8");
  const outcomes = fs.readFileSync("lib/intelligence/runtime/AvantiqoVerifiedOutcomeLearningRuntime.js", "utf8");
  const utility = fs.readFileSync("lib/intelligence/runtime/AvantiqoKnowledgeUtilityAttributionRuntime.js", "utf8");

  assert.match(observability, /OBSERVABILITY_SAMPLE_LIMIT\s*=\s*500/);
  assert.match(observability, /OBSERVABILITY_METADATA_SAMPLE_LIMIT\s*=\s*100/);
  assert.match(outcomes, /rolling_bucket:\s*true/);
  assert.match(outcomes, /RETENTION_DAYS\s*=\s*365/);
  assert.match(utility, /rolling_bucket:\s*!observationKeyFingerprint/);
  assert.match(utility, /RETENTION_DAYS\s*=\s*365/);
});
