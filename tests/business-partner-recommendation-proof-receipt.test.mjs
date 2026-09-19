import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const state = fs.readFileSync("lib/operator/contracts/OperatorRecommendationState.js", "utf8");
const legacy = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeLegacy.js", "utf8");
const governed = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeGoverned.js", "utf8");

test("exact governed recommendations carry a durable non-authoritative proof receipt", () => {
  assert.match(state, /AVANTIQO_OPERATOR_RECOMMENDATION_PROOF_V1/);
  assert.match(state, /evidence_class/);
  assert.match(state, /evidence_refs/);
  assert.match(state, /strongest_alternative/);
  assert.match(state, /critical_uncertainty/);
  assert.match(state, /falsification_condition/);
  assert.match(state, /next_proof_step/);
  assert.match(state, /execution_proof:\s*false/);
  assert.match(state, /authority_effect:\s*"NONE"/);
});

test("recommendation proof survives proposal selection and pending execution", () => {
  assert.match(state, /proof: normalized\.proof \|\| defaultRecommendationProof\(normalized\)/);
  assert.match(state, /recommendation_proof: boundRecommendation\.proof \|\| null/);
  assert.match(state, /selection_state:\s*"PROPOSED"/);
  assert.match(state, /selection_state:\s*"SELECTED"/);
  assert.match(governed, /separate_selection_required:\s*true/);
  assert.match(governed, /separate_execution_instruction_required:\s*true/);
});

test("live evidence and contextual inference remain explicitly different proof classes", () => {
  assert.match(legacy, /evidence_class:\s*"LIVE_EVIDENCE_BACKED"/);
  assert.match(legacy, /const evidenceRefs = list\(item\?\.evidence_refs\)/);
  assert.match(legacy, /evidence_dependencies:\s*evidenceDependencies/);
  assert.match(legacy, /capability_key:\s*text\(step\?\.capability_key/);
  assert.match(legacy, /volatility:\s*"dynamic"/);
  assert.match(legacy, /evidence_class:\s*"CONTEXTUAL_INFERENCE"/);
  assert.match(legacy, /strongest_alternative:\s*second\?\.capability/);
  assert.match(legacy, /requires_revalidation:\s*true/);
});

test("natural recommendation discussion receives persisted proof instead of reconstructing it", () => {
  assert.match(legacy, /Persisted recommendation proof:/);
  assert.match(legacy, /recommendationProofSummary/);
  assert.match(legacy, /This was a contextual inference, not a verified business fact/);
  assert.match(legacy, /It should be revalidated against current evidence before a consequential action relies on it/);
});

test("proof receipt cannot bypass recommendation governance", () => {
  assert.match(state, /operatorRecommendationMatchesPendingExecution/);
  assert.match(state, /recommendationBindingId !== pendingBindingId/);
  assert.match(state, /sameRecommendationValue\(pending\.payload, normalized\.payload\)/);
  assert.match(governed, /execution_authorized:\s*false/);
  assert.doesNotMatch(state, /proof[\s\S]{0,200}execution_authorized:\s*true/);
});
