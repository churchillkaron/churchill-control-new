import {
  certifyAvantiqoLearningEffectivenessCases,
} from "../lib/intelligence/runtime/AvantiqoLearningEffectivenessCertificationRuntime.mjs";

const paired = Object.freeze({
  same_cases_both_arms: true,
  blind_pairing: true,
  independent_evaluator: true,
  candidate_did_not_grade_itself: true,
  customer_private_cases_used: false,
});

function metrics({
  n = 24,
  success = 0.8,
  quality = 0.8,
  hallucination = 0.04,
  regressions = 0,
  critical = 0,
  governance = true,
  privacy = true,
  tools = true,
  authorization = true,
} = {}) {
  return {
    sample_count: n,
    success_rate: success,
    quality_score: quality,
    hallucination_rate: hallucination,
    regression_count: regressions,
    critical_failure_count: critical,
    governance_passed: governance,
    privacy_passed: privacy,
    tool_use_passed: tools,
    authorization_passed: authorization,
  };
}

const cases = [
  {
    id: "finance-durable-positive",
    category: "positive-transfer",
    expected_classification: "DURABLE_POSITIVE_TRANSFER",
    baseline: metrics({ success: 0.78, quality: 0.76, hallucination: 0.04 }),
    candidate: metrics({ success: 0.86, quality: 0.83, hallucination: 0.03 }),
    retention: metrics({ success: 0.85, quality: 0.82, hallucination: 0.03 }),
    evidence: paired,
  },
  {
    id: "code-durable-positive",
    category: "positive-transfer",
    expected_classification: "DURABLE_POSITIVE_TRANSFER",
    baseline: metrics({ success: 0.82, quality: 0.8, hallucination: 0.03 }),
    candidate: metrics({ success: 0.9, quality: 0.87, hallucination: 0.02 }),
    retention: metrics({ success: 0.89, quality: 0.86, hallucination: 0.02 }),
    evidence: paired,
  },
  {
    id: "research-positive",
    category: "positive-transfer",
    expected_classification: "POSITIVE_TRANSFER",
    baseline: metrics({ success: 0.74, quality: 0.72, hallucination: 0.06 }),
    candidate: metrics({ success: 0.83, quality: 0.8, hallucination: 0.05 }),
    evidence: paired,
  },
  {
    id: "tools-positive",
    category: "positive-transfer",
    expected_classification: "POSITIVE_TRANSFER",
    baseline: metrics({ success: 0.8, quality: 0.79, hallucination: 0.02 }),
    candidate: metrics({ success: 0.86, quality: 0.84, hallucination: 0.02 }),
    evidence: paired,
  },
  {
    id: "neutral-storage",
    category: "no-op",
    expected_classification: "NO_MEASURABLE_GAIN",
    baseline: metrics({ success: 0.82, quality: 0.81, hallucination: 0.03 }),
    candidate: metrics({ success: 0.825, quality: 0.817, hallucination: 0.031 }),
    evidence: paired,
  },
  {
    id: "neutral-retrieval",
    category: "no-op",
    expected_classification: "NO_MEASURABLE_GAIN",
    baseline: metrics({ success: 0.76, quality: 0.75, hallucination: 0.05 }),
    candidate: metrics({ success: 0.752, quality: 0.756, hallucination: 0.049 }),
    evidence: paired,
  },
  {
    id: "negative-quality",
    category: "negative-transfer",
    expected_classification: "NEGATIVE_TRANSFER",
    baseline: metrics({ success: 0.86, quality: 0.85, hallucination: 0.03 }),
    candidate: metrics({ success: 0.83, quality: 0.8, hallucination: 0.03 }),
    evidence: paired,
  },
  {
    id: "negative-success",
    category: "negative-transfer",
    expected_classification: "NEGATIVE_TRANSFER",
    baseline: metrics({ success: 0.84, quality: 0.82, hallucination: 0.03 }),
    candidate: metrics({ success: 0.79, quality: 0.82, hallucination: 0.03 }),
    evidence: paired,
  },
  {
    id: "negative-hallucination",
    category: "negative-transfer",
    expected_classification: "NEGATIVE_TRANSFER",
    baseline: metrics({ success: 0.8, quality: 0.79, hallucination: 0.03 }),
    candidate: metrics({ success: 0.85, quality: 0.84, hallucination: 0.05 }),
    evidence: paired,
  },
  {
    id: "negative-regression",
    category: "negative-transfer",
    expected_classification: "NEGATIVE_TRANSFER",
    baseline: metrics({ success: 0.8, quality: 0.8, hallucination: 0.03 }),
    candidate: metrics({ success: 0.86, quality: 0.85, hallucination: 0.02, regressions: 1 }),
    evidence: paired,
  },
  {
    id: "negative-governance",
    category: "negative-transfer",
    expected_classification: "NEGATIVE_TRANSFER",
    baseline: metrics({}),
    candidate: metrics({ success: 0.9, quality: 0.9, hallucination: 0.01, governance: false }),
    evidence: paired,
  },
  {
    id: "negative-privacy",
    category: "negative-transfer",
    expected_classification: "NEGATIVE_TRANSFER",
    baseline: metrics({}),
    candidate: metrics({ success: 0.9, quality: 0.9, hallucination: 0.01, privacy: false }),
    evidence: paired,
  },
  {
    id: "negative-tool-discipline",
    category: "negative-transfer",
    expected_classification: "NEGATIVE_TRANSFER",
    baseline: metrics({}),
    candidate: metrics({ success: 0.9, quality: 0.9, hallucination: 0.01, tools: false }),
    evidence: paired,
  },
  {
    id: "negative-authorization",
    category: "negative-transfer",
    expected_classification: "NEGATIVE_TRANSFER",
    baseline: metrics({}),
    candidate: metrics({ success: 0.9, quality: 0.9, hallucination: 0.01, authorization: false }),
    evidence: paired,
  },
  {
    id: "retention-forgetting",
    category: "backward-transfer",
    expected_classification: "BACKWARD_TRANSFER_REGRESSION",
    baseline: metrics({ success: 0.77, quality: 0.76, hallucination: 0.04 }),
    candidate: metrics({ success: 0.87, quality: 0.85, hallucination: 0.03 }),
    retention: metrics({ success: 0.79, quality: 0.79, hallucination: 0.04 }),
    evidence: paired,
  },
  {
    id: "retention-hallucination-regression",
    category: "backward-transfer",
    expected_classification: "BACKWARD_TRANSFER_REGRESSION",
    baseline: metrics({ success: 0.8, quality: 0.79, hallucination: 0.02 }),
    candidate: metrics({ success: 0.88, quality: 0.86, hallucination: 0.02 }),
    retention: metrics({ success: 0.86, quality: 0.84, hallucination: 0.04 }),
    evidence: paired,
  },
  {
    id: "retention-explicit-regression",
    category: "backward-transfer",
    expected_classification: "BACKWARD_TRANSFER_REGRESSION",
    baseline: metrics({ success: 0.79, quality: 0.77, hallucination: 0.03 }),
    candidate: metrics({ success: 0.88, quality: 0.85, hallucination: 0.02 }),
    retention: metrics({ success: 0.86, quality: 0.83, hallucination: 0.02, regressions: 1 }),
    evidence: paired,
  },
  {
    id: "insufficient-baseline",
    category: "evidence-sufficiency",
    expected_classification: "INSUFFICIENT_EVIDENCE",
    baseline: metrics({ n: 8, success: 0.6, quality: 0.6 }),
    candidate: metrics({ n: 8, success: 0.9, quality: 0.9, hallucination: 0.01 }),
    evidence: paired,
  },
  {
    id: "insufficient-candidate",
    category: "evidence-sufficiency",
    expected_classification: "INSUFFICIENT_EVIDENCE",
    baseline: metrics({ n: 24, success: 0.7, quality: 0.7 }),
    candidate: metrics({ n: 6, success: 0.95, quality: 0.95, hallucination: 0.01 }),
    evidence: paired,
  },
  {
    id: "invalid-not-blind",
    category: "counterfactual-integrity",
    expected_classification: "INVALID_COUNTERFACTUAL_EVIDENCE",
    baseline: metrics({}),
    candidate: metrics({ success: 0.9, quality: 0.9 }),
    evidence: { ...paired, blind_pairing: false },
  },
  {
    id: "invalid-self-graded",
    category: "counterfactual-integrity",
    expected_classification: "INVALID_COUNTERFACTUAL_EVIDENCE",
    baseline: metrics({}),
    candidate: metrics({ success: 0.9, quality: 0.9 }),
    evidence: { ...paired, candidate_did_not_grade_itself: false },
  },
  {
    id: "invalid-private-cases",
    category: "privacy-integrity",
    expected_classification: "INVALID_COUNTERFACTUAL_EVIDENCE",
    baseline: metrics({}),
    candidate: metrics({ success: 0.9, quality: 0.9 }),
    evidence: { ...paired, customer_private_cases_used: true },
  },
  {
    id: "mixed-quality-only",
    category: "uncertainty",
    expected_classification: "MIXED_OR_UNCERTAIN",
    baseline: metrics({ success: 0.82, quality: 0.8, hallucination: 0.03 }),
    candidate: metrics({ success: 0.81, quality: 0.825, hallucination: 0.03 }),
    evidence: paired,
  },
  {
    id: "mixed-success-only",
    category: "uncertainty",
    expected_classification: "MIXED_OR_UNCERTAIN",
    baseline: metrics({ success: 0.75, quality: 0.8, hallucination: 0.03 }),
    candidate: metrics({ success: 0.79, quality: 0.82, hallucination: 0.03 }),
    evidence: paired,
  },
  {
    id: "retention-insufficient",
    category: "retention-evidence",
    expected_classification: "POSITIVE_TRANSFER_UNVERIFIED_RETENTION",
    baseline: metrics({ success: 0.75, quality: 0.73, hallucination: 0.04 }),
    candidate: metrics({ success: 0.86, quality: 0.83, hallucination: 0.03 }),
    retention: metrics({ n: 6, success: 0.86, quality: 0.83, hallucination: 0.03 }),
    evidence: paired,
  },
];

const result = certifyAvantiqoLearningEffectivenessCases({ cases });

console.log("AVANTIQO_LEARNING_EFFECTIVENESS_CERTIFICATION_DIAGNOSTICS");
console.log(JSON.stringify({
  failures: result.failures,
  failed_cases: result.failed_cases.map((item) => ({
    id: item.id,
    category: item.category,
    expected: item.expected_classification,
    actual: item.classification,
    deltas: item.deltas || null,
  })),
}, null, 2));

if (!result.success) {
  console.error("AVANTIQO_LEARNING_EFFECTIVENESS_CERTIFICATION_FAIL");
  console.error(JSON.stringify(result.summary, null, 2));
  process.exit(1);
}

console.log("AVANTIQO_LEARNING_EFFECTIVENESS_CERTIFICATION_PASS");
console.log(JSON.stringify({
  status: result.status,
  ...result.summary,
  provider_execution_used: result.governance.provider_execution_used,
  gpu_execution_used: result.governance.gpu_execution_used,
  wallet_effect: result.governance.wallet_effect,
}, null, 2));
