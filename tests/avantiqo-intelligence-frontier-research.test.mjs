import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const bridgeSource = fs.readFileSync(
  new URL("../lib/operator/runtime/OperatorIntelligenceToolBridgeRuntime.js", import.meta.url),
  "utf8",
);
const capabilitySource = fs.readFileSync(
  new URL("../lib/platform/capabilities/createOperatorWebResearchCapability.js", import.meta.url),
  "utf8",
);
const mechanismSource = fs.readFileSync(
  new URL("../lib/platform/research/runtime/OperatorMechanismResearchRuntime.js", import.meta.url),
  "utf8",
);
const learningSource = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoMechanismFirstLearningRuntime.js", import.meta.url),
  "utf8",
);

test("General Intelligence promotes research when no known implementation exists", () => {
  assert.match(bridgeSource, /FRONTIER_RESEARCH_PATTERN/);
  assert.match(bridgeSource, /no existing implementation/);
  assert.match(bridgeSource, /known approach failed/);
  assert.match(bridgeSource, /frontier_research_is_not_blocked_by_missing_implementation:\s*true/);
});

test("frontier research is mechanism-first rather than implementation-copy-first", () => {
  assert.match(bridgeSource, /reason from mechanisms and constraints/i);
  assert.match(bridgeSource, /adjacent science\/engineering/i);
  assert.match(bridgeSource, /falsifiable hypotheses/i);
  assert.match(bridgeSource, /discriminating experiments/i);
  assert.match(capabilitySource, /implementation.*answer/i);
});

test("owned mechanism research derives hypotheses experiments and alternatives", () => {
  assert.match(mechanismSource, /failed known approach is evidence against that approach, not proof/i);
  assert.match(mechanismSource, /Hypotheses must be falsifiable/);
  assert.match(mechanismSource, /Experiments must discriminate between hypotheses/);
  assert.match(mechanismSource, /solution_directions/);
  assert.match(mechanismSource, /mode:\s*"deep"/);
  assert.match(mechanismSource, /allow_mutating_tools:\s*false/);
});

test("continuous learning shares the same invent test learn repeat doctrine", () => {
  assert.match(learningSource, /UNDERSTAND_PROBLEM/);
  assert.match(learningSource, /MAP_MECHANISMS/);
  assert.match(learningSource, /RESEARCH_ADJACENT_FIELDS/);
  assert.match(learningSource, /FORM_FALSIFIABLE_HYPOTHESES/);
  assert.match(learningSource, /DESIGN_DISCRIMINATING_EXPERIMENTS/);
  assert.match(learningSource, /INVENT_ALTERNATIVES/);
  assert.match(learningSource, /VERIFY_AND_REPEAT/);
  assert.match(learningSource, /automatic_gpu_execution:\s*false/);
});
