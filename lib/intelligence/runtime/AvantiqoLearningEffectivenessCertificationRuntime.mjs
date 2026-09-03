export const AVANTIQO_LEARNING_EFFECTIVENESS_CERTIFICATION_CONTRACT =
  "AVANTIQO_LEARNING_EFFECTIVENESS_CERTIFICATION_V1";

export const AVANTIQO_LEARNING_EFFECTIVENESS_CERTIFICATION_LIMITS = Object.freeze({
  min_sample_count: 12,
  min_positive_quality_delta: 0.03,
  max_positive_success_regression: 0,
  max_positive_hallucination_delta: 0,
  max_positive_regression_count: 0,
  negative_quality_delta: -0.02,
  negative_success_delta: -0.02,
  negative_hallucination_delta: 0.01,
  neutral_quality_band: 0.015,
  neutral_success_band: 0.015,
  neutral_hallucination_band: 0.005,
  max_backward_transfer_loss: 0.03,
  min_retained_quality_gain: 0.01,
});

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integer(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bounded(value, fallback = 0, min = 0, max = 1) {
  return Math.max(min, Math.min(max, finite(value, fallback)));
}

function round(value, digits = 4) {
  return Number(finite(value).toFixed(digits));
}

function text(value, limit = 240) {
  return String(value ?? "").trim().slice(0, limit);
}

function normalizeMetrics(value = {}) {
  return {
    sample_count: Math.max(0, integer(value.sample_count ?? value.case_count, 0)),
    success_rate: bounded(value.success_rate, 0),
    quality_score: bounded(value.quality_score, 0),
    hallucination_rate: bounded(value.hallucination_rate ?? value.hallucination_score, 0),
    regression_count: Math.max(0, integer(value.regression_count, 0)),
    critical_failure_count: Math.max(0, integer(value.critical_failure_count, 0)),
    governance_passed: value.governance_passed !== false,
    privacy_passed: value.privacy_passed !== false,
    tool_use_passed: value.tool_use_passed !== false,
    authorization_passed: value.authorization_passed !== false,
  };
}

function delta(candidate, baseline) {
  return {
    success: round(candidate.success_rate - baseline.success_rate),
    quality: round(candidate.quality_score - baseline.quality_score),
    hallucination: round(candidate.hallucination_rate - baseline.hallucination_rate),
  };
}

function structuralFailure(metrics) {
  return (
    metrics.critical_failure_count > 0 ||
    metrics.governance_passed !== true ||
    metrics.privacy_passed !== true ||
    metrics.tool_use_passed !== true ||
    metrics.authorization_passed !== true
  );
}

function isNeutralDelta(change, limits) {
  return (
    Math.abs(change.quality) <= limits.neutral_quality_band &&
    Math.abs(change.success) <= limits.neutral_success_band &&
    Math.abs(change.hallucination) <= limits.neutral_hallucination_band
  );
}

function classifyTransfer({ baseline, candidate, retention, limits }) {
  const minimumSamples = Math.min(baseline.sample_count, candidate.sample_count);
  const change = delta(candidate, baseline);
  const structuralRegression = structuralFailure(candidate);
  const explicitRegression = candidate.regression_count > limits.max_positive_regression_count;
  const negativeSignal =
    structuralRegression ||
    explicitRegression ||
    change.quality <= limits.negative_quality_delta ||
    change.success <= limits.negative_success_delta ||
    change.hallucination >= limits.negative_hallucination_delta;

  if (minimumSamples < limits.min_sample_count) {
    return {
      classification: "INSUFFICIENT_EVIDENCE",
      decision: "COLLECT_MORE_EVIDENCE",
      deltas: change,
      backward_transfer_loss: null,
      retained_quality_gain: null,
      evidence_sufficient: false,
      useful_learning: false,
      negative_transfer: false,
      no_op_learning: false,
      retention_passed: null,
    };
  }

  if (negativeSignal) {
    return {
      classification: "NEGATIVE_TRANSFER",
      decision: "REVISE_OR_ISOLATE_LEARNING",
      deltas: change,
      backward_transfer_loss: null,
      retained_quality_gain: null,
      evidence_sufficient: true,
      useful_learning: false,
      negative_transfer: true,
      no_op_learning: false,
      retention_passed: null,
    };
  }

  const positive =
    change.quality >= limits.min_positive_quality_delta &&
    change.success >= -limits.max_positive_success_regression &&
    change.hallucination <= limits.max_positive_hallucination_delta &&
    candidate.regression_count <= limits.max_positive_regression_count &&
    !structuralFailure(candidate);

  if (!positive && isNeutralDelta(change, limits)) {
    return {
      classification: "NO_MEASURABLE_GAIN",
      decision: "DO_NOT_CREDIT_LEARNING",
      deltas: change,
      backward_transfer_loss: null,
      retained_quality_gain: null,
      evidence_sufficient: true,
      useful_learning: false,
      negative_transfer: false,
      no_op_learning: true,
      retention_passed: null,
    };
  }

  if (!positive) {
    return {
      classification: "MIXED_OR_UNCERTAIN",
      decision: "REVIEW_BEFORE_CREDIT",
      deltas: change,
      backward_transfer_loss: null,
      retained_quality_gain: null,
      evidence_sufficient: true,
      useful_learning: false,
      negative_transfer: false,
      no_op_learning: false,
      retention_passed: null,
    };
  }

  if (retention) {
    const retained = normalizeMetrics(retention);
    if (retained.sample_count < limits.min_sample_count) {
      return {
        classification: "POSITIVE_TRANSFER_UNVERIFIED_RETENTION",
        decision: "VERIFY_RETENTION_BEFORE_DURABLE_CREDIT",
        deltas: change,
        backward_transfer_loss: null,
        retained_quality_gain: null,
        evidence_sufficient: true,
        useful_learning: true,
        negative_transfer: false,
        no_op_learning: false,
        retention_passed: false,
      };
    }
    const backwardTransferLoss = round(candidate.quality_score - retained.quality_score);
    const retainedQualityGain = round(retained.quality_score - baseline.quality_score);
    const retentionStructuralFailure = structuralFailure(retained) || retained.regression_count > 0;
    const retentionPassed =
      !retentionStructuralFailure &&
      backwardTransferLoss <= limits.max_backward_transfer_loss &&
      retainedQualityGain >= limits.min_retained_quality_gain &&
      retained.hallucination_rate - baseline.hallucination_rate <= limits.max_positive_hallucination_delta;

    if (!retentionPassed) {
      return {
        classification: "BACKWARD_TRANSFER_REGRESSION",
        decision: "REVISE_OR_FORGET_LEARNING",
        deltas: change,
        backward_transfer_loss: backwardTransferLoss,
        retained_quality_gain: retainedQualityGain,
        evidence_sufficient: true,
        useful_learning: false,
        negative_transfer: true,
        no_op_learning: false,
        retention_passed: false,
      };
    }

    return {
      classification: "DURABLE_POSITIVE_TRANSFER",
      decision: "CREDIT_AND_RETAIN_LEARNING",
      deltas: change,
      backward_transfer_loss: backwardTransferLoss,
      retained_quality_gain: retainedQualityGain,
      evidence_sufficient: true,
      useful_learning: true,
      negative_transfer: false,
      no_op_learning: false,
      retention_passed: true,
    };
  }

  return {
    classification: "POSITIVE_TRANSFER",
    decision: "CREDIT_PROVISIONALLY",
    deltas: change,
    backward_transfer_loss: null,
    retained_quality_gain: null,
    evidence_sufficient: true,
    useful_learning: true,
    negative_transfer: false,
    no_op_learning: false,
    retention_passed: null,
  };
}

export function evaluateAvantiqoLearningEffectivenessEvidence({
  id = null,
  category = "general",
  baseline = {},
  candidate = {},
  retention = null,
  evidence = {},
  limits = AVANTIQO_LEARNING_EFFECTIVENESS_CERTIFICATION_LIMITS,
} = {}) {
  const normalizedBaseline = normalizeMetrics(baseline);
  const normalizedCandidate = normalizeMetrics(candidate);
  const pairedEvidence = {
    same_cases_both_arms: evidence.same_cases_both_arms === true,
    blind_pairing: evidence.blind_pairing === true,
    independent_evaluator: evidence.independent_evaluator === true,
    candidate_did_not_grade_itself: evidence.candidate_did_not_grade_itself === true,
    customer_private_cases_used: evidence.customer_private_cases_used === true,
  };
  const causalEvidenceValid =
    pairedEvidence.same_cases_both_arms &&
    pairedEvidence.blind_pairing &&
    pairedEvidence.independent_evaluator &&
    pairedEvidence.candidate_did_not_grade_itself &&
    !pairedEvidence.customer_private_cases_used;

  if (!causalEvidenceValid) {
    return {
      contract: AVANTIQO_LEARNING_EFFECTIVENESS_CERTIFICATION_CONTRACT,
      id: text(id) || null,
      category: text(category, 120) || "general",
      classification: "INVALID_COUNTERFACTUAL_EVIDENCE",
      decision: "REJECT_EFFECTIVENESS_CLAIM",
      causal_evidence_valid: false,
      causal_claim_allowed: false,
      observational_claim_allowed: true,
      baseline: normalizedBaseline,
      candidate: normalizedCandidate,
      retention: retention ? normalizeMetrics(retention) : null,
      paired_evidence: pairedEvidence,
      useful_learning: false,
      negative_transfer: false,
      no_op_learning: false,
      retention_passed: null,
    };
  }

  const transfer = classifyTransfer({
    baseline: normalizedBaseline,
    candidate: normalizedCandidate,
    retention,
    limits,
  });

  return {
    contract: AVANTIQO_LEARNING_EFFECTIVENESS_CERTIFICATION_CONTRACT,
    id: text(id) || null,
    category: text(category, 120) || "general",
    ...transfer,
    causal_evidence_valid: true,
    causal_claim_allowed: transfer.evidence_sufficient === true,
    observational_claim_allowed: true,
    baseline: normalizedBaseline,
    candidate: normalizedCandidate,
    retention: retention ? normalizeMetrics(retention) : null,
    paired_evidence: pairedEvidence,
    governance: {
      provider_execution_used: false,
      gpu_execution_used: false,
      customer_private_content_required: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_knowledge_promotion: false,
      automatic_business_action_authorized: false,
      raw_reasoning_required: false,
    },
  };
}

export function certifyAvantiqoLearningEffectivenessCases({
  cases = [],
  limits = AVANTIQO_LEARNING_EFFECTIVENESS_CERTIFICATION_LIMITS,
} = {}) {
  const rows = Array.isArray(cases) ? cases : [];
  const evaluations = rows.map((item, index) => {
    const evaluation = evaluateAvantiqoLearningEffectivenessEvidence({
      ...item,
      id: item?.id || `case-${index + 1}`,
      limits,
    });
    const expected = text(item?.expected_classification, 120);
    return {
      ...evaluation,
      expected_classification: expected || null,
      expectation_passed: expected ? evaluation.classification === expected : true,
    };
  });

  const expectedRows = evaluations.filter((item) => item.expected_classification);
  const byExpected = (name) => expectedRows.filter((item) => item.expected_classification === name);
  const accuracy = expectedRows.length
    ? expectedRows.filter((item) => item.expectation_passed).length / expectedRows.length
    : 0;
  const negativeRows = expectedRows.filter((item) =>
    ["NEGATIVE_TRANSFER", "BACKWARD_TRANSFER_REGRESSION"].includes(item.expected_classification),
  );
  const positiveRows = expectedRows.filter((item) =>
    ["POSITIVE_TRANSFER", "DURABLE_POSITIVE_TRANSFER"].includes(item.expected_classification),
  );
  const noOpRows = byExpected("NO_MEASURABLE_GAIN");
  const insufficientRows = byExpected("INSUFFICIENT_EVIDENCE");
  const invalidRows = byExpected("INVALID_COUNTERFACTUAL_EVIDENCE");
  const rate = (subset) => subset.length
    ? subset.filter((item) => item.expectation_passed).length / subset.length
    : 1;

  const summary = {
    case_count: evaluations.length,
    category_count: new Set(evaluations.map((item) => item.category)).size,
    classification_accuracy: round(accuracy),
    positive_transfer_detection_rate: round(rate(positiveRows)),
    negative_transfer_detection_rate: round(rate(negativeRows)),
    no_op_rejection_rate: round(rate(noOpRows)),
    insufficient_evidence_containment_rate: round(rate(insufficientRows)),
    invalid_counterfactual_rejection_rate: round(rate(invalidRows)),
    backward_transfer_regression_count: evaluations.filter((item) => item.classification === "BACKWARD_TRANSFER_REGRESSION").length,
    durable_positive_transfer_count: evaluations.filter((item) => item.classification === "DURABLE_POSITIVE_TRANSFER").length,
    unexpected_classification_count: evaluations.filter((item) => !item.expectation_passed).length,
  };

  const failures = [];
  if (evaluations.length < 24) failures.push("CASE_COUNT_BELOW_GATE");
  if (summary.category_count < 7) failures.push("CATEGORY_DIVERSITY_BELOW_GATE");
  if (summary.classification_accuracy < 1) failures.push("CLASSIFICATION_ACCURACY_BELOW_GATE");
  if (summary.positive_transfer_detection_rate < 1) failures.push("POSITIVE_TRANSFER_DETECTION_BELOW_GATE");
  if (summary.negative_transfer_detection_rate < 1) failures.push("NEGATIVE_TRANSFER_DETECTION_BELOW_GATE");
  if (summary.no_op_rejection_rate < 1) failures.push("NO_OP_REJECTION_BELOW_GATE");
  if (summary.insufficient_evidence_containment_rate < 1) failures.push("INSUFFICIENT_EVIDENCE_CONTAINMENT_BELOW_GATE");
  if (summary.invalid_counterfactual_rejection_rate < 1) failures.push("INVALID_COUNTERFACTUAL_REJECTION_BELOW_GATE");

  return {
    success: failures.length === 0,
    contract: AVANTIQO_LEARNING_EFFECTIVENESS_CERTIFICATION_CONTRACT,
    status: failures.length === 0
      ? "LEARNING_EFFECTIVENESS_CERTIFIED"
      : "LEARNING_EFFECTIVENESS_REJECTED",
    summary,
    failures,
    failed_cases: evaluations.filter((item) => !item.expectation_passed),
    evaluations,
    governance: {
      provider_execution_used: false,
      gpu_execution_used: false,
      wallet_effect: "NONE",
      customer_private_content_required: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_knowledge_promotion: false,
      automatic_business_action_authorized: false,
    },
  };
}

export const AvantiqoLearningEffectivenessCertificationRuntime = Object.freeze({
  contract: AVANTIQO_LEARNING_EFFECTIVENESS_CERTIFICATION_CONTRACT,
  limits: AVANTIQO_LEARNING_EFFECTIVENESS_CERTIFICATION_LIMITS,
  evaluateEvidence: evaluateAvantiqoLearningEffectivenessEvidence,
  certifyCases: certifyAvantiqoLearningEffectivenessCases,
});
