import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/creative/director/orchestrator/CreativePipelineOrchestrator.js", "utf8");

test("approved challenger and Tribunal governance survives temporal rematerialization", () => {
  assert.match(source, /function preserveApprovedTemporalGovernance/);
  assert.match(source, /creative_tribunal: approvedPlan\.creative_tribunal/);
  assert.match(source, /selected_concept_id: selectedConceptId/);
  assert.match(source, /concept_council:/);
  assert.match(source, /concept_council_hash: councilHash/);
  assert.match(source, /selected_concept_hash: conceptHash/);
  assert.match(source, /preserveApprovedTemporalGovernance\(resolvedMaster, tribunalApprovedMaster\)/);
});
