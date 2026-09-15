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
