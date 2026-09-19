import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync("lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js", "utf8");
const graph = fs.readFileSync("lib/creative/production-graph/runtime/ProductionGraphRuntime.js", "utf8");

test("challenger resume carries immutable selection lineage into production plan", () => {
  assert.match(workflow, /concept_council: council/);
  assert.match(workflow, /selected_concept_id: challengerCheckpoint\.selected_concept_id/);
  assert.match(workflow, /concept_council_hash: councilHash/);
  assert.match(workflow, /selected_concept_hash: conceptHash/);
});

test("production graph validates challenger selection under its own governance contract", () => {
  assert.match(graph, /function validateChallengerSelection/);
  assert.match(graph, /CHALLENGER_TRIBUNAL_APPROVAL_REQUIRED/);
  assert.match(graph, /CHALLENGER_SELECTION_HASH_MISMATCH/);
  assert.match(graph, /validateChallengerSelection\(plan\)/);
  assert.match(graph, /validateConceptCouncil\(plan\)/);
});
