import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const source = fs.readFileSync("lib/creative/director/orchestrator/CreativePipelineOrchestrator.js", "utf8");
test("sealed temporal graph reuse requires exact current lineage and shot structure", () => {
  assert.match(source, /const activeLineage = storyLineage\(direction\.master\?\.plan \|\| \{\}\)/);
  assert.match(source, /const activeShotCount = list\(direction\.master\?\.plan\?\.scenes\)/);
  assert.match(source, /const candidateLineage = storyLineage\(metadata\)/);
  assert.match(source, /candidateShotCount === activeShotCount/);
  assert.match(source, /candidateLineage\.master_plan_hash/);
  assert.match(source, /candidateLineage\.story_contract_hash/);
});
