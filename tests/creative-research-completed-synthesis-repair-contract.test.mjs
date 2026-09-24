import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/creative/research/runtime/AutonomousResearchDirectorV4Runtime.js", "utf8");

test("completed research can be repaired without rerunning the full synthesis", () => {
  assert.match(source, /repairCompletedSynthesis/);
  assert.match(source, /latestCompletedStructuredSynthesis/);
  assert.match(source, /repair_of_usage_id/);
  assert.match(source, /STRUCTURED_REPAIR/);
  assert.match(source, /max_output_tokens: localRepair \? 2200 : 3000/);
  assert.match(source, /const estimatedRepairInputTokens = localRepair/);
  assert.match(source, /Math\.ceil\(repairPrompt\.length \/ 3\.2\)/);
  assert.match(source, /: 16000/);
  assert.match(source, /estimated_input_tokens: estimatedRepairInputTokens/);
  assert.match(source, /mergeResearchRepair/);
  assert.match(source, /collectDynamicPublicEvidence/);
});
