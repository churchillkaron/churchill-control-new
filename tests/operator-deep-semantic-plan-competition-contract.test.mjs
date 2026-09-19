import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const source = fs.readFileSync(
  "lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js",
  "utf8",
);

test("deep strategic cognition activates multi-candidate planning", () => {
  assert.match(source, /semanticDepth === "deep"/);
  assert.match(source, /\["strategic", "analytical", "creative"\]\.includes\(semanticMode\)/);
  assert.match(source, /cognitiveBriefSystem\(\{ multiCandidate \}\)/);
  assert.match(source, /generate 2 to 4 materially different plan_candidates/);
  assert.match(source, /operator_plan_graph deliberate/);
  assert.match(source, /stress_test/);
});

test("multi-candidate reasoning remains planning-only and selective", () => {
  assert.match(source, /multi_candidate_reasoning: multiCandidate/);
  assert.match(source, /authorization: \{ allow_mutating_tools: false \}/);
  assert.match(source, /Use plan_candidates=\[\] unless multi-candidate reasoning was requested/);
  assert.match(source, /max_output_tokens: multiCandidate \? 2400 : 1500/);
});
