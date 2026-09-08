import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/creative/research/runtime/AutonomousResearchDirectorV4Runtime.js", "utf8");

test("completed research can be repaired without rerunning the full synthesis", () => {
  assert.match(source, /repairCompletedSynthesis/);
  assert.match(source, /latestCompletedStructuredSynthesis/);
  assert.match(source, /repair_of_usage_id/);
  assert.match(source, /STRUCTURED_REPAIR/);
  assert.match(source, /max_output_tokens: 3000/);
  assert.match(source, /estimated_input_tokens: 16000/);
  assert.match(source, /mergeResearchRepair/);
  assert.match(source, /collectDynamicPublicEvidence/);
});
