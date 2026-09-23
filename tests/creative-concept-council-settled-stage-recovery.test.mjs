import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../lib/creative/director/runtime/CreativeConceptCouncilRuntime.js", import.meta.url), "utf8");

test("all paid concept council stages recover settled reasoning before new inference", () => {
  assert.match(source, /recoverSettledCouncilOperation/);
  assert.match(source, /CREATIVE_CONCEPT_CRITIC_/);
  assert.match(source, /selectionOperation = "CREATIVE_EXECUTIVE_CONCEPT_SELECTION_V1"/);
  assert.match(source, /revisionOperation = "CREATIVE_SELECTED_CONCEPT_PLAN_REVISION_V1"/);
  assert.match(source, /settledSelection \|\| await reason/);
  assert.match(source, /recoverSettledCouncilOperation\(context, revisionOperation, revisionInputHash\) \|\| await reason/);
});

test("settled council recovery is bound to the exact current input fingerprint", () => {
  assert.match(source, /council_input_hash: inputHash \|\| null/);
  assert.match(source, /expectedInputHash/);
  assert.match(source, /metadata\.council_input_hash/);
  assert.match(source, /revisionInputHash/);
});

test("critic and executive selection preserve exact concept identity by hash", () => {
  assert.match(source, /CREATIVE_CONCEPT_CRITIC_CONCEPT_HASH_MISMATCH/);
  assert.match(source, /selected_concept_hash/);
  assert.match(source, /CREATIVE_EXECUTIVE_CONCEPT_HASH_MISMATCH/);
  assert.match(source, /concept_hash: hash\(source\)/);
});

test("settled council operation is bound to operation project mission and success", () => {
  assert.match(source, /text\(metadata\.operation\)\.toUpperCase\(\) !== expectedOperation/);
  assert.match(source, /text\(metadata\.creative_project_id\)/);
  assert.match(source, /text\(metadata\.creative_mission_id\)/);
  assert.match(source, /text\(usage\.status\)\.toUpperCase\(\) !== "SUCCESS"/);
});

test("story-level council revision ignores model-created scenes when original master has none", () => {
  assert.match(source, /const revisedScenes = originalScenes\.length \? list\(revision\.scenes\) : \[\];/);
});
