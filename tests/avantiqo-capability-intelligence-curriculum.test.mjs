import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("lib/intelligence/runtime/AvantiqoCapabilityIntelligenceCurriculumRuntime.js", "utf8");
const curriculum = fs.readFileSync("lib/intelligence/runtime/AvantiqoGeneralIntelligenceCurriculumRuntime.js", "utf8");
const route = fs.readFileSync("app/api/internal/intelligence/continuous-learning/process/route.js", "utf8");

test("capability intelligence follows the live operator catalog", () => {
  assert.match(runtime, /listOperatorCapabilities/);
  assert.match(runtime, /all_capabilities_assessed:true/);
  assert.match(runtime, /capability_existence_does_not_equal_intelligence:true/);
});

test("capability coverage combines semantics knowledge outcomes and verification", () => {
  assert.match(runtime, /catalogScore \* 0\.22 \+ knowledgeScore \* 0\.23 \+ outcomeScore \* 0\.2 \+ verificationScore \* 0\.15 \+ competenceScore \* 0\.2/);
  assert.match(runtime, /EXACT_CAPABILITY_KNOWLEDGE_THIN/);
  assert.match(runtime, /VERIFIED_OUTCOME_EXPERIENCE_THIN/);
  assert.match(runtime, /VERIFICATION_CONTRACT_MISSING/);
});


test("capability outcome coverage weights live evidence above historical backfill without changing authority", () => {
  assert.match(runtime, /weightedCapabilityOutcomeEvidence/);
  assert.match(runtime, /weighted_verified_outcome_units/);
  assert.match(runtime, /live_verified_outcome_count/);
  assert.match(runtime, /historical_backfill_outcome_count/);
});

test("capability curriculum resolves canonical learning organization and persists a valid memory type", () => {
  assert.match(runtime, /resolveAvantiqoLearningOrganization/);
  assert.match(runtime, /allowDatabaseFallback: true/);
  assert.match(runtime, /memory_type:"fact"/);
});

test("nightly capability study is bounded to the weakest capability", () => {
  assert.match(runtime, /sort\(\(a,b\) => a\.coverage\.score-b\.coverage\.score/);
  assert.match(runtime, /const selected = assessments\[0\]/);
  assert.match(runtime, /nightly_capability_research_max_items:1/);
  assert.match(runtime, /importance:0\.997/);
});

test("capability research separates subject matter from product truth", () => {
  assert.match(runtime, /Use Avantiqo canonical product knowledge for claims about what the product itself can do/);
  assert.match(runtime, /canonical_product_truth_must_come_from_internal_knowledge:true/);
  assert.match(runtime, /automatic_knowledge_promotion:false/);
  assert.match(runtime, /automatic_model_training:false/);
});

test("general intelligence school is broad beyond business domains", () => {
  for (const domain of ["mathematics","physics","chemistry","biology","health-literacy","engineering","control-systems","information-theory","language","strategy","product-design","creative","marketing","history-geography","civics-geopolitics","research"]) {
    assert.match(curriculum, new RegExp(`"${domain}"`));
  }
});

test("capability curriculum is reconciled before continuous research", () => {
  const coverage = route.indexOf("reconcileAvantiqoCapabilityIntelligenceCurriculum()");
  const research = route.indexOf("runAvantiqoContinuousLearningBatch({ limit })");
  assert.ok(coverage >= 0 && research > coverage);
  assert.match(route, /capability_intelligence_curriculum: capabilityIntelligenceCurriculum/);
});
