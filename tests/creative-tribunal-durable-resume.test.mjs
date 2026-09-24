import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const tribunal = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url),
  "utf8",
);
const workflow = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js", import.meta.url),
  "utf8",
);

test("repair approval boundary preserves Tribunal resume package", () => {
  assert.match(tribunal, /let repair;[\s\S]*try \{[\s\S]*CREATIVE_DYNAMIC_TRIBUNAL_REPAIR_V1/);
  assert.match(tribunal, /const resumePackage = tribunalResumePackage\(\{ plan, tribunal \}\)/);
  assert.match(tribunal, /error\.resume_package = resumePackage/);
  assert.match(tribunal, /error\.repaired_plan = error\.repaired_plan \|\| plan/);
});

test("workflow persists sealed Tribunal resume state with exact scope identity", () => {
  assert.match(workflow, /CREATIVE_TRIBUNAL_DURABLE_RESUME_V1/);
  assert.match(workflow, /organization_id: context\.organization_id/);
  assert.match(workflow, /creative_mission_id: context\.creative_mission_id/);
  assert.match(workflow, /creative_project_id: context\.creative_project_id/);
  assert.match(workflow, /resume_package: resumePackage/);
});
test("workflow automatically loads stored Tribunal resume state", () => {
  assert.match(workflow, /storedTribunalResume\(context\.project, context\)/);
  assert.match(workflow, /input\.tribunal_resume_package[\s\S]*approvedMaster\.tribunal_resume_package[\s\S]*storedTribunalResume/);
});


test("all Director review branches rehydrate durable Tribunal state", () => {
  assert.match(workflow, /const storedResume = storedTribunalResume\(scopedProject, context\) \|\| \{\}/);
  assert.match(workflow, /review_panel: reviewInput\.review_panel \|\| storedResume\.review_panel \|\| null/);
  assert.match(workflow, /settled_reviews:[\s\S]*storedResume\.settled_reviews/);
  assert.match(workflow, /settled_review_plan_hash:[\s\S]*storedResume\.settled_review_plan_hash/);
  assert.match(workflow, /settled_review_source_plan:[\s\S]*storedResume\.settled_review_source_plan/);
  assert.match(workflow, /Object\.keys\(storedPlan\)\.length[\s\S]*plan: storedPlan/);
});


test("stored temporal checkpoint backfills durable challenger hashes on read", () => {
  assert.match(workflow, /function storedTemporalDirectionCheckpoint/);
  assert.match(workflow, /return restoreTribunalLineage\(master, master\)/);
});

test("Tribunal replay preserves settled concept council lineage", () => {
  assert.match(workflow, /function restoreTribunalLineage/);
  assert.match(workflow, /const mergedCouncil =/);
  assert.match(workflow, /const derivedConceptHash/);
  assert.match(workflow, /const derivedCouncilHash/);
  assert.match(workflow, /authoritativeCouncil\.concept_hash[\s\S]*incomingCouncil\.concept_hash[\s\S]*derivedConceptHash/);
  assert.match(workflow, /authoritativeCouncil\.council_hash[\s\S]*incomingCouncil\.council_hash[\s\S]*derivedCouncilHash/);
  assert.match(workflow, /independent_concept_council: mergedCouncil/);
  assert.match(workflow, /concept_council: mergedCouncil/);
  assert.match(workflow, /const approvedPlanHash = CreativeDynamicTribunalRuntime\.reviewPlanHash\(approvedCheckpoint\.plan\)/);
  assert.match(workflow, /if \(approvedPlanHash === currentPlanHash\) \{[\s\S]*return restoreTribunalLineage\(approvedCheckpoint, reviewInput\.master\)/);
  assert.match(workflow, /await clearTribunalApprovedMaster\(context\)/);
});

test("successful Tribunal clears durable resume state", () => {
  assert.match(workflow, /const master = await CreativeDynamicTribunalRuntime\.review\(effectiveReviewInput\)/);
  assert.match(workflow, /await clearTribunalResume\(context\)/);
  assert.match(workflow, /delete metadata\[TRIBUNAL_RESUME_METADATA_KEY\]/);
});

test("resume persistence failure never replaces the original Tribunal error", () => {
  assert.match(workflow, /error\.resume_persistence_error = String/);
  assert.match(workflow, /throw error;/);
});