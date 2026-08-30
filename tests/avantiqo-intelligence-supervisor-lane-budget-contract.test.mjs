import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SUPERVISOR = new URL(
  "../lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime.js",
  import.meta.url,
);
const THESIS = new URL(
  "../lib/operator/runtime/OperatorBusinessThesisRuntime.js",
  import.meta.url,
);

async function source(url) {
  return readFile(url, "utf8");
}

test("generic supervisor explicitly maps non-deep modes to Fast and Deep to Deep", async () => {
  const text = await source(SUPERVISOR);
  assert.match(
    text,
    /function executionLaneForMode\(mode\)[\s\S]*?normalizeMode\(mode\) === "deep" \? "deep" : "fast"/,
  );
  assert.match(
    text,
    /const executionLane = text\(execution_lane, 40\)\.toLowerCase\(\) \|\|[\s\S]*?executionLaneForMode\(mode\);/,
  );
  assert.match(text, /execution_lane: executionLane,/);
});

test("Deep structured reasoning cannot be starved below 4096 output tokens", async () => {
  const text = await source(SUPERVISOR);
  assert.match(text, /: 4096;/);
  assert.match(text, /const minimum = normalizedMode === "deep" \? 4096 : 128;/);
});

test("machine-boundary compilation is explicitly Fast", async () => {
  const text = await source(SUPERVISOR);
  const compilerStart = text.indexOf("async function compilerPhase");
  const runStart = text.indexOf("export async function runStructuredIntelligenceSupervisor");
  assert.ok(compilerStart >= 0 && runStart > compilerStart);
  const compiler = text.slice(compilerStart, runStart);
  assert.match(compiler, /structured_supervisor_execution_lane: "fast"/);
  assert.match(compiler, /execution_lane: "fast"/);
  assert.match(compiler, /bounded_non_thinking_fast_lane: true/);
});

test("Deep critique/review is repaired on Fast rather than opening a second Deep lease", async () => {
  const text = await source(SUPERVISOR);
  const deepBranch = text.slice(text.indexOf('if (normalizedMode === "deep")'));
  assert.match(deepBranch, /name: "critique_repair"/);
  assert.match(deepBranch, /execution_lane: "fast"/);
});

test("bounded business thesis synthesis uses Fast text generation and no 900-token Deep choke", async () => {
  const text = await source(THESIS);
  const operation = text.slice(text.indexOf("const execution = await ServiceExecutionRuntime.execute"));
  assert.match(operation, /service_id: "ai\.text\.generate"/);
  assert.match(operation, /execution_lane: "fast"/);
  assert.match(operation, /max_output_tokens: 1800/);
  assert.match(operation, /bounded_structured_synthesis: true/);
  assert.doesNotMatch(operation, /service_id: "ai\.reasoning\.execute"/);
  assert.doesNotMatch(operation, /max_output_tokens: 900/);
});
