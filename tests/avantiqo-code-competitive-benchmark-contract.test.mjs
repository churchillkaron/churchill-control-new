import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../scripts/benchmark-avantiqo-code-competitive.mjs", import.meta.url),
  "utf8",
);

test("competitive benchmark requires substantial identical current reference evidence", () => {
  assert.match(source, /MIN_CASES = 20/);
  assert.match(source, /MAX_REFERENCE_AGE_DAYS = 30/);
  assert.match(source, /canonical_suite_exact/);
  assert.match(source, /minimum_case_count/);
  assert.match(source, /reference_fresh/);
  assert.match(source, /verifyCodeAICompetitiveReferenceReport/);
  assert.match(source, /verifyCodeAICompetitiveOwnedReport/);
  assert.match(source, /cryptographic_reference_attestation_required: true/);
  assert.match(source, /exact_suite_sha256_binding_required: true/);
  assert.match(source, /exact_prompt_contract_sha256_binding_required: true/);
  assert.match(source, /exact_runner_source_commit_required: true/);
  assert.match(source, /AVANTIQO_CODE_COMPETITIVE_RUNNER_SOURCE_COMMIT_MISMATCH/);
  assert.match(source, /AVANTIQO_CODE_COMPETITIVE_OWNED_PROMPT_CONTRACT_MISMATCH/);
});

test("competitive benchmark measures quality latency and cost", () => {
  assert.match(source, /owned_pass_rate_not_worse/);
  assert.match(source, /owned_quality_non_loss_rate/);
  assert.match(source, /MIN_QUALITY_WIN_MARGIN/);
  assert.match(source, /MIN_ABSOLUTE_CASE_QUALITY_SCORE/);
  assert.match(source, /MIN_ABSOLUTE_MEAN_QUALITY_SCORE/);
  assert.match(source, /OWNED_ABSOLUTE_QUALITY_FLOOR_NOT_MET/);
  assert.match(source, /REFERENCE_ABSOLUTE_QUALITY_FLOOR_NOT_MET/);
  assert.match(source, /symmetric_absolute_quality_floor_required/);
  assert.match(source, /MIN_SUPERIORITY_WIN_RATE/);
  assert.match(source, /MIN_SUPERIORITY_WIN_CATEGORIES/);
  assert.match(source, /quality_win_category_count/);
  assert.match(source, /quality_win_rate/);
  assert.match(source, /quality_score_delta/);
  assert.match(source, /deterministic_quality_scores_complete/);
  assert.match(source, /case_specific_evidence_grounding_complete/);
  assert.match(source, /case_specific_narrative_grounding_complete/);
  assert.match(source, /MIN_NARRATIVE_GROUNDING_SCORE/);
  assert.match(source, /latency_outcome/);
  assert.match(source, /p95_latency_competitive/);
  assert.match(source, /cost_competitive/);
});

test("superiority claim fails closed and never changes runtime provider routing", () => {
  assert.match(source, /comparisons\.length >= 2 && comparisons\.every/);
  assert.match(source, /superiority_claim_allowed: superiorityClaimAllowed/);
  assert.match(source, /speed_alone_cannot_establish_quality_superiority: true/);
  assert.match(source, /quality_superiority_requires_reference_quality_win: true/);
  assert.match(source, /actual_repository_mutation_evidence_required_for_superiority: true/);
  assert.match(source, /hidden_acceptance_evidence_required_for_superiority: true/);
  assert.match(source, /runtime_provider_effect: "NONE"/);
  assert.match(source, /external_reference_execution_performed: false/);
});
