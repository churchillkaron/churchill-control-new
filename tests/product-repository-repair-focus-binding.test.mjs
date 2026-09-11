import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile("lib/intelligence/runtime/AvantiqoProductRepositoryAssessmentRuntime.js", "utf8");

test("bounded Business Partner repair focus cannot drift to an unrelated Product objective", () => {
  assert.match(source, /requestedRepairCapabilityKey\(focus\)/);
  assert.match(source, /repair the existing declared business partner capability/);
  assert.match(source, /candidatePreservesRequestedRepair/);
  assert.match(source, /allRankedCandidates\.filter/);
  assert.match(source, /requested_repair_capability_key: repairCapabilityKey/);
  assert.match(source, /repair_focus_enforced: Boolean\(repairCapabilityKey\)/);
  assert.match(source, /every candidate must preserve that exact capability key/);
  assert.match(source, /objectiveSelectionFromAssessment\(\{[\s\S]*productDecisionResearch,[\s\S]*focus,[\s\S]*\}\)/);
});
