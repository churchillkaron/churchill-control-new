import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const master = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeMasterPlanRuntime.js", import.meta.url),
  "utf8",
);
const council = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeConceptCouncilRuntime.js", import.meta.url),
  "utf8",
);
const runner = fs.readFileSync(
  new URL("../scripts/creative-one-clip.mjs", import.meta.url),
  "utf8",
);

test("authorized recovered story is restored before repair validation", () => {
  assert.match(master, /function preserveAuthorizedRecoveredStory/);
  assert.match(master, /mergeCreativeRepairedPlan\(plan, safeRepair\)/);
  assert.match(master, /preserveAuthorizedRecoveredStory\([\s\S]*mergeCreativeRepairedPlan/);
  assert.match(master, /creative_story_lineage_recovery/);
  assert.match(master, /CREATIVE_STORY_LINEAGE_LOCK_V1/);
});

test("lineage lock preserves core concept and story while allowing audience review enrichment", () => {
  assert.match(master, /structuredClone\(recoveredConcept\)/);
  assert.match(master, /candidateConcept\.target_audience/);
  assert.match(master, /story: structuredClone\(recoveredPlan\.story\)/);
  assert.match(master, /creative_system: structuredClone\(recoveredPlan\.creative_system\)/);
  assert.match(master, /signature_images: structuredClone\(recoveredPlan\.signature_images\)/);
});

test("runner automatically isolates recovered lineage from historical manager assets", () => {
  assert.match(runner, /recoveredLineageProject/);
  assert.match(runner, /creative_story_lineage_recovery/);
  assert.match(runner, /historicalStoryAsset/);
  assert.match(runner, /manager cinematic/);
  assert.match(runner, /restaurant cinematic/);
  assert.match(runner, /kitchen cinematic/);
});

test("council recovery exposes explicit lineage lock semantics", () => {
  assert.match(council, /preserveAuthorizedStoryLineage/);
  assert.match(council, /CREATIVE_STORY_LINEAGE_LOCK_V1/);
});
