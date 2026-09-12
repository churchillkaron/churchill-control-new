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
  assert.match(source, /cryptographic_reference_attestation_required: true/);
  assert.match(source, /exact_suite_sha256_binding_required: true/);
  assert.match(source, /exact_prompt_contract_sha256_binding_required: true/);
  assert.match(source, /AVANTIQO_CODE_COMPETITIVE_OWNED_PROMPT_CONTRACT_MISMATCH/);
});

test("competitive benchmark measures quality latency and cost", () => {
  assert.match(source, /owned_pass_rate_not_worse/);
  assert.match(source, /owned_win_rate/);
  assert.match(source, /p95_latency_competitive/);
  assert.match(source, /cost_competitive/);
});

test("superiority claim fails closed and never changes runtime provider routing", () => {
  assert.match(source, /comparisons\.length >= 2 && comparisons\.every/);
  assert.match(source, /superiority_claim_allowed: competitiveCertified/);
  assert.match(source, /runtime_provider_effect: "NONE"/);
  assert.match(source, /external_reference_execution_performed: false/);
});
