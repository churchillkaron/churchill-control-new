import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const state = fs.readFileSync("lib/operator/contracts/OperatorRecommendationState.js", "utf8");
const turn = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntime.js", "utf8");
const legacy = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeLegacy.js", "utf8");

test("live recommendation proof stores exact refreshable read dependencies", () => {
  assert.match(state, /evidence_dependencies/);
  assert.match(state, /capability_key:\s*text\(source\.capability_key/);
  assert.match(state, /payload:\s*object\(source\.payload\)/);
  assert.match(legacy, /source_kind:\s*"registered_operator_read"/);
  assert.match(legacy, /observed_at:\s*observedAt/);
});

test("selected live-evidence recommendation runs deterministic validity before mutation", () => {
  assert.match(turn, /assessOperatorIntelligenceDecisionValidity/);
  assert.match(turn, /preflightSelectedRecommendationFreshness/);
  assert.match(turn, /evidence_class, 80\) !== "LIVE_EVIDENCE_BACKED"/);
  assert.match(turn, /initial\.decision_valid_now === true/);
  assert.match(turn, /initial\.requires_replan === true/);
  assert.match(turn, /mutation_executed:\s*false/);
});

test("stale live evidence is refreshed only through canonical registered read chain", () => {
  assert.match(turn, /capability:\s*"operator_read_chain"/);
  assert.match(turn, /action:\s*"execute"/);
  assert.match(turn, /AVANTIQO_RECOMMENDATION_REVALIDATION/);
  assert.match(turn, /steps\.some\(\(step\) => !step\.capability_key\)/);
  assert.match(turn, /text\(step\?\.status, 40\)\.toLowerCase\(\) !== "completed"/);
});

test("freshness refresh preserves exact selected action and changes only proof state", () => {
  assert.match(turn, /recommended_action:\s*\{ \.{3}recommendation, proof \}/);
  assert.match(turn, /pending_execution:\s*\{ \.\.\.pending, recommendation_proof: proof \}/);
  assert.match(turn, /recommended_action:\s*\{ \.\.\.recommendation, proof \}/);
  assert.match(turn, /pending_execution:\s*\{ \.\.\.pending, recommendation_proof: proof \}/);
  assert.match(turn, /authority_effect:\s*"NONE"/);
  assert.match(turn, /execution_proof:\s*false/);
});

test("freshness gate runs before independent post-action verification preflight", () => {
  const freshness = turn.indexOf("await preflightSelectedRecommendationFreshness(effectiveOptions)");
  const verification = turn.indexOf("await preflightSelectedRecommendationVerification(effectiveOptions)");
  assert.ok(freshness >= 0);
  assert.ok(verification > freshness);
});
