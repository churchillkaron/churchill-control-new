import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const modal = fs.readFileSync("services/avantiqo-intelligence-modal/modal_app.py", "utf8");
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js", "utf8");
const masterPlan = fs.readFileSync("lib/creative/director/runtime/CreativeMasterPlanRuntime.js", "utf8");
const conceptCouncil = fs.readFileSync("lib/creative/director/runtime/CreativeConceptCouncilRuntime.js", "utf8");
const tribunal = fs.readFileSync("lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", "utf8");
const preproductionRepair = fs.readFileSync("lib/creative/production-room/runtime/CreativePreproductionCreativeRepairRuntime.js", "utf8");
const surgicalRevision = fs.readFileSync("lib/creative/revisions/runtime/CreativeShotSurgicalRevisionRuntime.js", "utf8");

test("Deep H100 keeps a bounded warm window while retaining scale-to-zero", () => {
  assert.match(modal, /AVANTIQO_INTELLIGENCE_DEEP_SCALEDOWN_SECONDS[\s\S]*?\"5\"/);
  assert.match(modal, /def deep[\s\S]*?DEEP_SCALEDOWN_WINDOW_SECONDS|DEEP_SCALEDOWN_WINDOW_SECONDS[\s\S]*?def deep/);
  assert.match(modal, /min_containers=0/);
  assert.match(modal, /max_containers=1/);
  assert.match(provider, /deep_bounded_warm_idle_seconds: 5/);
  assert.match(registration, /deep_bounded_warm_idle_seconds: 5/);
});

test("bounded master-plan contract repair no longer defaults to Deep H100", () => {
  const start = masterPlan.indexOf("async function repairInvalidPlan");
  const end = masterPlan.indexOf("export const CreativeMasterPlanRuntime", start);
  const repair = masterPlan.slice(start, end);
  assert.match(repair, /operation: "MASTER_PLAN_CONTRACT_REPAIR_V1"/);
  assert.match(repair, /execution_lane: "fast"/);
});


test("compact Studio repair and review work is explicitly eligible for local Qwen fast routing", () => {
  const repairStart = conceptCouncil.indexOf("async function repairSelectedConceptDimension");
  const reevaluateStart = conceptCouncil.indexOf("async function reevaluateSelectedCritic");
  const applyStart = conceptCouncil.indexOf("function applySelectedCriticReevaluation", reevaluateStart);
  const repair = conceptCouncil.slice(repairStart, reevaluateStart);
  const reevaluate = conceptCouncil.slice(reevaluateStart, applyStart);
  assert.match(repair, /maxOutputTokens: 1800/);
  assert.match(repair, /executionLane: "fast"/);
  assert.match(reevaluate, /maxOutputTokens: 1200/);
  assert.match(reevaluate, /executionLane: "fast"/);

  const reviewStart = tribunal.indexOf("async function runReviews");
  const reviewEnd = tribunal.indexOf("async function", reviewStart + 20);
  const reviews = tribunal.slice(reviewStart, reviewEnd > reviewStart ? reviewEnd : undefined);
  assert.match(reviews, /ANTI_CLICHE/);
  assert.match(reviews, /PRODUCTION_FEASIBILITY/);
  assert.match(reviews, /execution_lane:[\s\S]*?"fast"/);
});


test("compact preproduction repair and single-shot revision use bounded fast routing", () => {
  assert.match(preproductionRepair, /PREPRODUCTION_CREATIVE_REPAIR_V1/);
  assert.match(preproductionRepair, /max_output_tokens: 2400/);
  assert.match(preproductionRepair, /execution_lane: "fast"/);
  assert.match(surgicalRevision, /SURGICAL_SHOT_REVISION_V1/);
  assert.match(surgicalRevision, /max_output_tokens: 2200/);
  assert.match(surgicalRevision, /execution_lane: "fast"/);
});


test("short-form cinematic critique and one-to-two-shot atomic revisions are local-Qwen eligible", () => {
  const impact = fs.readFileSync("lib/creative/director/runtime/CreativeCinematicImpactRuntime.js", "utf8");
  const atomic = fs.readFileSync("lib/creative/revisions/runtime/CreativeAtomicShotSetRevisionRuntime.js", "utf8");
  const critiqueStart = impact.indexOf("async function critiquePlan");
  const critiqueEnd = impact.indexOf("async function repairPlan", critiqueStart);
  const critique = impact.slice(critiqueStart, critiqueEnd);
  assert.match(critique, /maxOutputTokens <= 1800[\s\S]*?executionLane: "fast"/);
  assert.match(atomic, /verifiedShots\.length <= 2[\s\S]*?execution_lane: "fast"/);
  assert.match(atomic, /maxOutputTokens = Math\.min\(16000, 2500 \+ verifiedShots\.length \* 700\)/);
});


test("Music Studio bounded critics and repair use local-Qwen supervisor while invention stays deep", () => {
  const creativeReasoning = fs.readFileSync("lib/creative/reasoning/CreativeReasoningService.js", "utf8");
  const supervisor = fs.readFileSync("lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime.js", "utf8");
  assert.match(creativeReasoning, /MUSIC_STUDIO_CRITIC_PANEL/);
  assert.match(creativeReasoning, /MUSIC_STUDIO_PREPRODUCTION_REPAIR/);
  assert.match(creativeReasoning, /MUSIC_STUDIO_CRITIC_PANEL: 1800/);
  assert.match(creativeReasoning, /MUSIC_STUDIO_PREPRODUCTION_REPAIR: 2400/);
  assert.match(supervisor, /BOUNDED_FAST_STRUCTURED_OPERATIONS[\s\S]*MUSIC_STUDIO_CRITIC_PANEL[\s\S]*MUSIC_STUDIO_PREPRODUCTION_REPAIR/);
  assert.match(supervisor, /boundedFastStructured \? "fast" : normalizedMode/);
  assert.doesNotMatch(creativeReasoning, /MUSIC_STUDIO_CONCEPT_[^\n]*BOUNDED_FAST/);
  assert.doesNotMatch(creativeReasoning, /MUSIC_STUDIO_RESEARCH_ROOM[^\n]*BOUNDED_FAST/);
});
