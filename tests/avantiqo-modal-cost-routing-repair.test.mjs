import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const provider=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js","utf8");
const registration=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js","utf8");
const masterPlan=fs.readFileSync("lib/creative/director/runtime/CreativeMasterPlanRuntime.js","utf8");
const conceptCouncil=fs.readFileSync("lib/creative/director/runtime/CreativeConceptCouncilRuntime.js","utf8");
const preproductionRepair=fs.readFileSync("lib/creative/production-room/runtime/CreativePreproductionCreativeRepairRuntime.js","utf8");
const surgicalRevision=fs.readFileSync("lib/creative/revisions/runtime/CreativeShotSurgicalRevisionRuntime.js","utf8");
const supervisor=fs.readFileSync("lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime.js","utf8");
const creativeReasoning=fs.readFileSync("lib/creative/reasoning/CreativeReasoningService.js","utf8");

test("Deep reasoning stays local-only with bounded idle policy",()=>{
  assert.match(provider,/local_only: true/);
  assert.match(provider,/modal_fallback_allowed: false/);
  assert.match(provider,/deep_bounded_warm_idle_seconds: 5/);
  assert.match(registration,/local_only: true/);
  assert.match(registration,/modal_fallback_allowed: false/);
  assert.match(registration,/runtime_contract: "AVANTIQO_INTELLIGENCE_DEEP_SCALE_ZERO_V3"/);
  assert.match(registration,/warm_retention_seconds: 5/);
});

test("bounded master-plan contract repair uses Fast owned reasoning",()=>{
  const start=masterPlan.indexOf("async function repairInvalidPlan");
  const end=masterPlan.indexOf("export const CreativeMasterPlanRuntime",start);
  const repair=masterPlan.slice(start,end);
  assert.match(repair,/operation: "MASTER_PLAN_CONTRACT_REPAIR_V1"/);
  assert.match(repair,/execution_lane: "fast"/);
});

test("selected concept repair and critic reevaluation remain bounded Fast work",()=>{
  const repairStart=conceptCouncil.indexOf("async function repairSelectedConceptDimension");
  const reevaluateStart=conceptCouncil.indexOf("async function reevaluateSelectedCritic");
  const applyStart=conceptCouncil.indexOf("function applySelectedCriticReevaluation",reevaluateStart);
  const repair=conceptCouncil.slice(repairStart,reevaluateStart);
  const reevaluate=conceptCouncil.slice(reevaluateStart,applyStart);
  assert.match(repair,/maxOutputTokens: 1800/);
  assert.match(repair,/executionLane: "fast"/);
  assert.match(reevaluate,/maxOutputTokens: 1200/);
  assert.match(reevaluate,/executionLane: "fast"/);
});

test("preproduction repair may use Deep quality reasoning while surgical revision stays Fast",()=>{
  assert.match(preproductionRepair,/PREPRODUCTION_CREATIVE_REPAIR_V1/);
  assert.match(preproductionRepair,/max_output_tokens: 6000/);
  assert.match(preproductionRepair,/execution_lane: "deep"/);
  assert.match(surgicalRevision,/SURGICAL_SHOT_REVISION_V1/);
  assert.match(surgicalRevision,/max_output_tokens: 2200/);
  assert.match(surgicalRevision,/execution_lane: "fast"/);
});

test("Music Studio bounded critic and repair operations are Fast-supervised while larger invention remains Deep",()=>{
  assert.match(supervisor,/BOUNDED_FAST_STRUCTURED_OPERATIONS/);
  assert.match(supervisor,/MUSIC_STUDIO_CRITIC_PANEL/);
  assert.match(supervisor,/MUSIC_STUDIO_PREPRODUCTION_REPAIR/);
  assert.match(supervisor,/boundedFastStructured \? "fast" : normalizedMode/);
  assert.match(creativeReasoning,/execution_lane: "deep"/);
  assert.match(creativeReasoning,/MUSIC_STUDIO_RESEARCH_ROOM/);
});
