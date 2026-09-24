import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url), "utf8");

test("human performance reviewers have a dedicated compact discipline", () => {
  assert.match(source, /human\[-_ \]\?performance[\s\S]*return "HUMAN_PERFORMANCE"/);
  assert.match(source, /case "HUMAN_PERFORMANCE":\s*return humanPerformancePlanEvidence/);
});

test("human performance scope contains performance and causal story evidence without full plan fallback", () => {
  assert.match(source, /function humanPerformancePlanEvidence/);
  assert.match(source, /performance_integration/);
  assert.match(source, /hero_agency/);
  assert.match(source, /causal_story/);
});

test("human performance reviewer respects intentionally restrained acting", () => {
  assert.match(source, /stillness, observation, restraint or minimal action/);
  assert.match(source, /do not demand dramatic gestures, dialogue or visible reaction/);
});

test("human performance reviewer requires tribunal schema", () => {
  assert.match(source, /HUMAN_PERFORMANCE[\s\S]*reviewer_id: reviewer\.id[\s\S]*score: "0-100"[\s\S]*passed: "boolean"/);
});
