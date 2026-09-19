import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync("lib/intelligence/runtime/AvantiqoBusinessPartnerExperienceRuntime.js", "utf8");
const conversation = fs.readFileSync("lib/operator/runtime/IntelligenceConversationRuntime.js", "utf8");

test("experience engine records one structural trajectory per persisted assistant turn", () => {
  assert.match(runtime, /platform_business_partner_experience/);
  assert.match(runtime, /experience-turn:/);
  assert.match(runtime, /source_turn_fingerprint/);
  assert.match(runtime, /onConflict: "organization_id,memory_scope,memory_key"/);
  assert.match(conversation, /recordAvantiqoBusinessPartnerExperience/);
  assert.match(conversation, /sourceTurnId: persistedTurnId/);
});

test("experience engine keeps only structural non-customer fields", () => {
  for (const pattern of [
    /structural_only: true/,
    /customer_private_content_included: false/,
    /customer_identifiers_included: false/,
    /raw_decision_persisted: false/,
    /raw_evidence_persisted: false/,
    /raw_payload_persisted: false/,
    /raw_output_persisted: false/,
    /raw_reasoning_persisted: false/,
  ]) assert.match(runtime, pattern);
});

test("experience engine carries verified outcome and failure semantics without adding authority", () => {
  assert.match(runtime, /observeVerifiedExecutionSuccess/);
  assert.match(runtime, /observeVerifiedExecutionFailure/);
  assert.match(runtime, /affects_capability_reliability/);
  assert.match(runtime, /authority_effect: "NONE"/);
  assert.match(runtime, /automatic_training_effect: "NONE"/);
  assert.match(runtime, /automatic_model_promotion: false/);
});

test("experience engine exposes bounded capability summaries for nightly learning", () => {
  assert.match(runtime, /summarizeAvantiqoBusinessPartnerExperience/);
  assert.match(runtime, /experience_strength/);
  assert.match(runtime, /verified_success_count/);
  assert.match(runtime, /verified_failure_count/);
  assert.match(runtime, /prerequisite_failure_count/);
  assert.match(runtime, /model_reasoning_failure_count/);
  assert.match(runtime, /transport_runtime_failure_count/);
  assert.match(runtime, /automatic_training_started:false/);
});


test("experience engine stores only structural capability chains for mission dependency graph", () => {
  assert.match(runtime, /structuralMissionChain/);
  assert.match(runtime, /capability_sequence/);
  assert.match(runtime, /capability_dependency_edges/);
  assert.match(runtime, /depends_on/);
  assert.match(runtime, /raw_decision_persisted: false/);
});
