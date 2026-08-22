import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const candidate = await readFile(
  new URL("../lib/operator/runtime/OperatorIntelligenceActionCandidateRuntime.js", import.meta.url),
  "utf8",
);
const planning = await readFile(
  new URL("../lib/operator/runtime/OperatorIntelligencePlanningToolRuntime.js", import.meta.url),
  "utf8",
);
const synthetic = await readFile(
  new URL("../lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", import.meta.url),
  "utf8",
);
const repair = await readFile(
  new URL("../lib/operator/runtime/OperatorRepairSupervisionRuntime.js", import.meta.url),
  "utf8",
);

assert.match(candidate, /AVANTIQO_OPERATOR_INTELLIGENCE_ACTION_CANDIDATE_V1/);
assert.match(candidate, /candidate_only: true/);
assert.match(candidate, /executed: false/);
assert.match(candidate, /persisted: false/);
assert.match(candidate, /normal_operator_governance_required: true/);
assert.doesNotMatch(candidate, /executeUbteCapability/);
assert.doesNotMatch(candidate, /allow_mutating_tools:\s*true/);
assert.match(candidate, /missing_required_fields/);
assert.match(candidate, /INTERNAL_KEYS/);
assert.match(planning, /createReadTools/);
assert.match(planning, /createTools/);
assert.match(synthetic, /operator_action_candidate/);
assert.match(synthetic, /allow_mutating_tools: false/);
assert.match(repair, /operator_action_candidate/);
assert.match(repair, /Do not retry or execute writes/);

console.log("PASS avantiqo action candidate planning bridge contract");
