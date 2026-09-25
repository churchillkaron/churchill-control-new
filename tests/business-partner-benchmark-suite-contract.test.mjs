import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateBusinessPartnerBenchmarkEvidence,
  loadBusinessPartnerBenchmarkSuite,
  validateBusinessPartnerBenchmarkSuite,
} from "../lib/intelligence/runtime/AvantiqoBusinessPartnerBenchmarkEvidenceRuntime.mjs";

const suite = loadBusinessPartnerBenchmarkSuite();

test("benchmark suite is broad, guarded and covers every quality dimension", () => {
  const result = validateBusinessPartnerBenchmarkSuite(suite);
  assert.equal(result.valid, true);
  assert.ok(result.case_count >= 36);
  assert.ok(result.category_count >= 10);
  assert.deepEqual(result.missing_dimensions, []);
  assert.deepEqual(result.duplicate_ids, []);
  assert.deepEqual(result.cases_without_guardrails, []);
});

function providerCases(score) {
  return suite.cases.map((entry) => ({
    case_id: entry.id,
    scores: Object.fromEntries(suite.dimensions.map((dimension) => [dimension, score])),
  }));
}

test("fresh complete matched evidence certifies only when candidate meets strongest reference floor", () => {
  const report = {
    contract: "AVANTIQO_BUSINESS_PARTNER_BENCHMARK_EVIDENCE_V1",
    generated_at: new Date().toISOString(),
    matched_conditions: true,
    same_case_prompts: true,
    same_evidence_packets: true,
    same_tool_contracts: true,
    hidden_expected_outcomes_not_exposed: true,
    candidate: { cases: providerCases(0.95) },
    references: {
      chatgpt: { cases: providerCases(0.93) },
      claude: { cases: providerCases(0.94) },
      gemini: { cases: providerCases(0.92) },
    },
  };

  const result = evaluateBusinessPartnerBenchmarkEvidence({ report });
  assert.equal(result.release_eligible, true);

  report.candidate.cases[0].scores.contextual_continuity = 0;
  const below = evaluateBusinessPartnerBenchmarkEvidence({ report });
  assert.equal(below.release_eligible, false);
});

test("missing reference cases and stale evidence fail closed", () => {
  const old = new Date(Date.now() - 9 * 86400000).toISOString();
  const report = {
    contract: "AVANTIQO_BUSINESS_PARTNER_BENCHMARK_EVIDENCE_V1",
    generated_at: old,
    matched_conditions: true,
    same_case_prompts: true,
    same_evidence_packets: true,
    same_tool_contracts: true,
    hidden_expected_outcomes_not_exposed: true,
    candidate: { cases: providerCases(1) },
    references: {
      chatgpt: { cases: providerCases(0.5) },
      claude: { cases: providerCases(0.5).slice(1) },
      gemini: { cases: providerCases(0.5) },
    },
  };

  const result = evaluateBusinessPartnerBenchmarkEvidence({ report });
  assert.equal(result.release_eligible, false);
  assert.equal(result.evidence_fresh, false);
  assert.equal(result.missing_reference_cases.claude.length, 1);
});


test("dimension aggregation scores only cases that declare the dimension", () => {
  const selectiveCases = suite.cases.map((entry) => ({
    case_id: entry.id,
    scores: Object.fromEntries(entry.requires.map((dimension) => [dimension, 0.95])),
  }));
  const report = {
    contract: "AVANTIQO_BUSINESS_PARTNER_BENCHMARK_EVIDENCE_V1",
    generated_at: new Date().toISOString(),
    matched_conditions: true,
    same_case_prompts: true,
    same_evidence_packets: true,
    same_tool_contracts: true,
    hidden_expected_outcomes_not_exposed: true,
    candidate: { cases: selectiveCases },
    references: {
      chatgpt: { cases: selectiveCases },
      claude: { cases: selectiveCases },
      gemini: { cases: selectiveCases },
    },
  };

  const result = evaluateBusinessPartnerBenchmarkEvidence({ report });
  assert.equal(result.release_eligible, true);

  const target = report.candidate.cases.find((item) =>
    item.scores.contextual_continuity !== undefined
  );
  delete target.scores.contextual_continuity;
  const missingRequired = evaluateBusinessPartnerBenchmarkEvidence({ report });
  assert.equal(missingRequired.release_eligible, false);
});
