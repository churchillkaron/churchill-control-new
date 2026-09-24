import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const approval = fs.readFileSync("lib/creative/production-room/runtime/CreativePreproductionSpendApprovalRuntime.js", "utf8");
const specialist = fs.readFileSync("lib/creative/production-room/runtime/CreativeProductionSpecialistExecutionRuntime.js", "utf8");
const repair = fs.readFileSync("lib/creative/production-room/runtime/CreativePreproductionCreativeRepairRuntime.js", "utf8");
const workflow = fs.readFileSync("lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js", "utf8");
const script = fs.readFileSync("scripts/creative-preproduction-specialist-approval.mjs", "utf8");

test("preproduction specialist spend requires a sealed bounded approval", () => {
  assert.match(approval, /CREATIVE_PREPRODUCTION_SPECIALIST_BUDGET_APPROVAL_V1/);
  assert.match(approval, /maximum_customer_price/);
  assert.match(approval, /maximum_per_call_customer_price/);
  assert.match(approval, /maximum_calls/);
  assert.match(approval, /media_generation_authorized === true/);
  assert.match(approval, /publication_authorized === true/);
  assert.match(approval, /QUEUE_BY_PROJECT/);
  assert.match(approval, /SERVICE_EXECUTION_COST_GUARD_V1/);
});

test("every production specialist work order executes through the governed ledger", () => {
  assert.match(specialist, /executeApprovedPreproductionReasoning/);
  assert.match(specialist, /operation: `PRODUCTION_WORKSTREAM_\$\{work_order\.requirement\}`/);
  assert.doesNotMatch(specialist, /const result = await execution_runtime\.execute\(/);
});

test("Creative Floor benchmark failures enter the owned repair lane before downstream rooms", () => {
  assert.match(repair, /PREPRODUCTION_CREATIVE_REPAIR_V1/);
  assert.match(repair, /GENERIC_TECH_REVEAL/);
  assert.match(repair, /BEAUTY_HERO_SHOT_DEFICIT/);
  assert.match(repair, /evaluateBenchmarkLab/);
  assert.match(workflow, /creativeFloorBlocked/);
  assert.match(workflow, /repairCreativeFloorPlan/);
  assert.match(workflow, /persistPostRepairMasterCheckpoint/);
});

test("approval script cannot authorize media generation or publication", () => {
  assert.match(script, /MAXIMUM_CALLS = 28/);
  assert.match(script, /PRODUCTION_WORKSTREAM_\*/);
  assert.match(script, /PREPRODUCTION_CREATIVE_REPAIR_V1/);
  assert.match(script, /media_generation_authorized: false/);
  assert.match(script, /publication_authorized: false/);
  assert.match(script, /APPROVE PREPRODUCTION/);
});


test("owned local zero-price preproduction reasoning stays inside the sealed specialist contract", () => {
  assert.match(approval, /benchmarkLocalApproval/);
  assert.match(approval, /benchmark_review_preview_authorized/);
  assert.match(approval, /execution_scope: BENCHMARK_SCOPE/);
  assert.match(approval, /benchmark_only: true/);
  assert.match(approval, /owned_only_required: true/);
  assert.match(approval, /studio_preproduction_review: true/);
  assert.match(approval, /external_fallback_allowed: false/);
});


test("preproduction specialist local approval strictly allowlists its approved model", () => {
  assert.match(approval, /allowed_models: \[approval\.model\]\.filter\(Boolean\)/);
});


test("Creative Floor repair can repair and persist the benchmark lab from approved reference assets", () => {
  assert.match(repair, /reference_assets:/);
  assert.match(repair, /CREATIVE_BENCHMARK_LAB_V1/);
  assert.match(repair, /Use exact asset_id values as evidence_ref/);
  assert.match(repair, /repaired\.benchmark_lab = benchmarkLab/);
  assert.match(repair, /repairedPlan\.benchmark_lab \|\| benchmark_lab/);
});


test("Creative Floor repair unwraps provider JSON text and gives the repair enough deep-output headroom", () => {
  assert.match(repair, /candidate\.text \|\| candidate\.answer \|\| candidate\.content/);
  assert.match(repair, /JSON\.parse\(nestedText\)/);
  assert.match(repair, /max_output_tokens: 6000/);
  assert.match(repair, /execution_lane: "deep"/);
});


test("Creative Floor repair normalizes settled Qwen benchmark output into the evaluator contract", () => {
  assert.match(repair, /function normalizedBenchmarkLab/);
  assert.match(repair, /contract: "CREATIVE_BENCHMARK_LAB_V1"/);
  assert.match(repair, /referenceAssets\.slice\(0, 3\)/);
  assert.match(repair, /evidence_ref:[\s\S]*text\(entry\.asset_id \|\| entry\.evidence_ref\)[\s\S]*text\(fallbackStudy\.evidence_ref/);
  assert.match(repair, /function normalizedSignatureImages/);
});
