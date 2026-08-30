import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtimePath =
  "lib/creative/director/runtime/CreativeOwnedInvestorFilmMissionRuntime.js";
const temporalPath =
  "lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js";
const universalTemporalPath =
  "lib/creative/director/runtime/CreativeUniversalTemporalDirectionRuntime.js";
const ownedReasoningPath =
  "lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js";
const ownedGuardPath =
  "supabase/migrations/20260829095500_intelligence_owned_only_provider_guard.sql";

const runtime = fs.readFileSync(runtimePath, "utf8");
const temporal = fs.readFileSync(temporalPath, "utf8");
const universalTemporal = fs.readFileSync(universalTemporalPath, "utf8");
const ownedReasoning = fs.readFileSync(ownedReasoningPath, "utf8");
const ownedGuard = fs.readFileSync(ownedGuardPath, "utf8");

test("investor film is a 4-5 minute owned Intelligence mission", () => {
  assert.match(runtime, /MINIMUM_DURATION_SECONDS = 240/);
  assert.match(runtime, /MAXIMUM_DURATION_SECONDS = 300/);
  assert.match(runtime, /DEFAULT_DURATION_SECONDS = 270/);
  assert.match(runtime, /OWNED_INTELLIGENCE_PROVIDER = "avantiqo-intelligence"/);
  assert.match(runtime, /execution_lane: "deep"/);
  assert.match(runtime, /assertOwnedIntelligence\(execution, "DIRECTOR_CHARTER"\)/);
  assert.match(runtime, /assertOwnedIntelligence\(temporal, "TEMPORAL_DIRECTION"\)/);
  assert.match(runtime, /assertOwnedIntelligence\(execution, "PLAN_REVIEW"\)/);
});

test("investor film is grounded in canonical Avantiqo product truth", () => {
  assert.match(runtime, /evaluateAvantiqoReusableKnowledge/);
  assert.match(runtime, /CANONICAL_PRODUCT_KNOWLEDGE/);
  assert.match(runtime, /MINIMUM_CANONICAL_EVIDENCE_ITEMS = 6/);
  assert.match(runtime, /MINIMUM_PRODUCT_PROOF_AREAS = 4/);
  assert.match(runtime, /canonical_product_evidence/);
  assert.match(runtime, /canonical_evidence_ids/);
  assert.match(runtime, /UNGROUNDED_PRODUCT_CLAIM/);
  assert.match(runtime, /REVIEW_FALSE_SUPPORTED_CLAIM/);
});

test("legacy investor material has no creative authority", () => {
  assert.match(runtime, /old_investor_script_authority: false/);
  assert.match(runtime, /creative_authority: false/);
  assert.match(runtime, /REFERENCE_CANDIDATE_ONLY/);
  assert.match(runtime, /old_investor_script_used_as_creative_authority: false/);
  assert.match(runtime, /legacy_assets_are_reference_candidates_only: true/);
  assert.doesNotMatch(runtime, /render-avantiqo-investor/i);
  assert.doesNotMatch(runtime, /investor-film-production/i);
  assert.doesNotMatch(runtime, /17-scene/i);
});

test("film direction demands narration, original score, sound and product proof", () => {
  assert.match(runtime, /narration_expected: true/);
  assert.match(runtime, /original_music_and_sound_design_expected: true/);
  assert.match(runtime, /truthful_product_proof_expected: true/);
  assert.match(runtime, /narration_required: true/);
  assert.match(runtime, /original_score_required: true/);
  assert.match(runtime, /real_product_proof_required: true/);
  assert.match(runtime, /final_master_resolution: "4K"/);
  assert.match(runtime, /score_and_sound_are_directed/);
  assert.match(runtime, /continuity_is_directed/);
});

test("planning certification cannot pretend production or release happened", () => {
  assert.match(runtime, /production_started: false/);
  assert.match(runtime, /gpu_generation_performed: false/);
  assert.match(runtime, /release_master_certified: false/);
  assert.match(runtime, /planning_certified: true/);
});

test("current temporal director is still the detailed scene and shot engine", () => {
  assert.match(runtime, /CreativeUniversalTemporalDirectionRuntime/);
  assert.match(universalTemporal, /CreativeTemporalMasterPlanRuntime/);
  assert.match(temporal, /CREATIVE_FULL_TEMPORAL_DURATION_REQUIRED/);
  assert.match(temporal, /sceneCountRange/);
  assert.match(temporal, /shotCountRange/);
});

test("platform Intelligence policy is owned-only with no external fallback", () => {
  assert.match(ownedReasoning, /const OWNED_PROVIDER = "avantiqo-intelligence"/);
  assert.match(ownedReasoning, /allowed_providers: \[OWNED_PROVIDER\]/);
  assert.match(ownedGuard, /fallback_enabled = false/);
  assert.match(ownedGuard, /external_intelligence_fallback_allowed/);
  assert.match(ownedGuard, /provider <> 'avantiqo-intelligence'/);
});
