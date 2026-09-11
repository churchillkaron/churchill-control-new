import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source = await readFile(new URL("../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js", import.meta.url), "utf8");
test("workflow resolve resumes durable council before new paid direction", () => {
  assert.match(source, /const councilCheckpoint = storedCouncilCheckpoint\(context\.project, context\)/);
  assert.match(source, /CreativeWorkflowResolutionRuntime\.resumeApprovedCouncil/);
  assert.match(source, /recoverSettledPostCouncilRepairs\(context\.project\)/);
});
test("post-council repair recovery is bounded to repairs after selected revision", () => {
  assert.match(source, /CREATIVE_SELECTED_CONCEPT_PLAN_REVISION_V1/);
  assert.match(source, /slice\(revisionIndex \+ 1\)/);
  assert.match(source, /MASTER_PLAN_CONTRACT_REPAIR_V1/);
  assert.match(source, /UsageRuntime\.get\(entry\.usage_id\)/);
});
