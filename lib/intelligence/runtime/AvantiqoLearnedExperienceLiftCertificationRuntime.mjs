export const AVANTIQO_LEARNED_EXPERIENCE_LIFT_CERTIFICATION_CONTRACT =
  "AVANTIQO_LEARNED_EXPERIENCE_LIFT_CERTIFICATION_V1";

export const AVANTIQO_LEARNED_EXPERIENCE_LIFT_CERTIFICATION_LIMITS = Object.freeze({
  min_cases: 36,
  min_categories: 6,
  min_sessions: 8,
  min_candidate_accuracy: 0.97,
  min_category_accuracy: 0.95,
  min_learning_gain_accuracy: 0.97,
  min_learning_lift: 0.5,
  min_premise_awareness_accuracy: 1,
  min_retention_control_accuracy: 1,
  max_retention_regressions: 0,
  max_superseded_leakage: 0,
  max_forgotten_leakage: 0,
  max_expired_leakage: 0,
  max_context_chars_per_case: 3200,
});

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}

function mean(values) {
  return values.length
    ? values.reduce((sum, value) => sum + number(value), 0) / values.length
    : 0;
}

function normalizeCase(value, index) {
  const id = text(value?.id, 240) || `learned-experience-${index + 1}`;
  const expectedAbstain = value?.expected_abstain === true;
  const expectedId = text(value?.expected_id, 240) || null;
  if (!expectedAbstain && !expectedId) {
    throw new Error(`AVANTIQO_LEARNED_EXPERIENCE_EXPECTED_STATE_REQUIRED:${id}`);
  }
  return {
    ...value,
    id,
    category: text(value?.category, 120) || "general",
    expected_id: expectedId,
    expected_abstain: expectedAbstain,
    superseded_ids: [...new Set(list(value?.superseded_ids).map((entry) => text(entry, 240)).filter(Boolean))],
    forgotten_ids: [...new Set(list(value?.forgotten_ids).map((entry) => text(entry, 240)).filter(Boolean))],
    expired_ids: [...new Set(list(value?.expired_ids).map((entry) => text(entry, 240)).filter(Boolean))],
    session_count: Math.max(1, Math.floor(number(value?.session_count, 1))),
    revision_count: Math.max(0, Math.floor(number(value?.revision_count, 0))),
    learning_gain_case: value?.learning_gain_case === true,
    premise_awareness: value?.premise_awareness === true,
    retention_control: value?.retention_control === true,
  };
}

function normalizeRun(value = {}) {
  return {
    retrieved_ids: [...new Set(list(value.retrieved_ids).map((entry) => text(entry, 240)).filter(Boolean))],
    context_chars: Math.max(0, number(value.context_chars)),
    raw_result_count: Math.max(0, number(value.raw_result_count)),
  };
}

function isCorrect(benchmarkCase, run) {
  if (benchmarkCase.expected_abstain) return run.retrieved_ids.length === 0;
  return (run.retrieved_ids[0] || null) === benchmarkCase.expected_id;
}

function evaluateArm(benchmarkCase, run) {
  return {
    correct: isCorrect(benchmarkCase, run),
    superseded_hits: run.retrieved_ids.filter((id) => benchmarkCase.superseded_ids.includes(id)),
    forgotten_hits: run.retrieved_ids.filter((id) => benchmarkCase.forgotten_ids.includes(id)),
    expired_hits: run.retrieved_ids.filter((id) => benchmarkCase.expired_ids.includes(id)),
  };
}

function accuracy(rows, selector = (row) => row.candidate.correct) {
  if (!rows.length) return 1;
  return mean(rows.map((row) => selector(row) ? 1 : 0));
}

export function evaluateAvantiqoLearnedExperienceLiftCertification({
  cases = [],
  runArm,
  limits = AVANTIQO_LEARNED_EXPERIENCE_LIFT_CERTIFICATION_LIMITS,
} = {}) {
  if (typeof runArm !== "function") {
    throw new Error("AVANTIQO_LEARNED_EXPERIENCE_ARM_RUNNER_REQUIRED");
  }

  const normalizedCases = list(cases).map(normalizeCase);
  if (normalizedCases.length < number(limits.min_cases, 36)) {
    throw new Error("AVANTIQO_LEARNED_EXPERIENCE_CASE_COUNT_TOO_SMALL");
  }
  const categories = new Set(normalizedCases.map((item) => item.category));
  if (categories.size < number(limits.min_categories, 6)) {
    throw new Error("AVANTIQO_LEARNED_EXPERIENCE_CATEGORY_DIVERSITY_TOO_SMALL");
  }
  const maxSessions = normalizedCases.reduce((max, item) => Math.max(max, item.session_count), 0);
  if (maxSessions < number(limits.min_sessions, 8)) {
    throw new Error("AVANTIQO_LEARNED_EXPERIENCE_SESSION_DEPTH_TOO_SMALL");
  }
  if (!normalizedCases.some((item) => item.learning_gain_case)) {
    throw new Error("AVANTIQO_LEARNED_EXPERIENCE_GAIN_CASE_REQUIRED");
  }
  if (!normalizedCases.some((item) => item.premise_awareness)) {
    throw new Error("AVANTIQO_LEARNED_EXPERIENCE_PREMISE_CASE_REQUIRED");
  }
  if (!normalizedCases.some((item) => item.retention_control)) {
    throw new Error("AVANTIQO_LEARNED_EXPERIENCE_RETENTION_CONTROL_REQUIRED");
  }

  const evaluations = normalizedCases.map((benchmarkCase) => {
    const baselineRun = normalizeRun(runArm(benchmarkCase, "baseline"));
    const candidateRun = normalizeRun(runArm(benchmarkCase, "candidate"));
    return {
      id: benchmarkCase.id,
      category: benchmarkCase.category,
      expected_id: benchmarkCase.expected_id,
      expected_abstain: benchmarkCase.expected_abstain,
      learning_gain_case: benchmarkCase.learning_gain_case,
      premise_awareness: benchmarkCase.premise_awareness,
      retention_control: benchmarkCase.retention_control,
      session_count: benchmarkCase.session_count,
      revision_count: benchmarkCase.revision_count,
      baseline: {
        ...baselineRun,
        ...evaluateArm(benchmarkCase, baselineRun),
      },
      candidate: {
        ...candidateRun,
        ...evaluateArm(benchmarkCase, candidateRun),
      },
    };
  });

  const learningCases = evaluations.filter((item) => item.learning_gain_case);
  const premiseCases = evaluations.filter((item) => item.premise_awareness);
  const retentionCases = evaluations.filter((item) => item.retention_control);
  const baselineLearningAccuracy = accuracy(learningCases, (item) => item.baseline.correct);
  const candidateLearningAccuracy = accuracy(learningCases);
  const learningLift = candidateLearningAccuracy - baselineLearningAccuracy;
  const retentionRegressions = retentionCases.filter((item) => item.baseline.correct && !item.candidate.correct);
  const supersededLeakage = evaluations.reduce((sum, item) => sum + item.candidate.superseded_hits.length, 0);
  const forgottenLeakage = evaluations.reduce((sum, item) => sum + item.candidate.forgotten_hits.length, 0);
  const expiredLeakage = evaluations.reduce((sum, item) => sum + item.candidate.expired_hits.length, 0);
  const maximumContextChars = evaluations.reduce((max, item) => Math.max(max, item.candidate.context_chars), 0);
  const categoryMetrics = [...categories].sort().map((category) => {
    const rows = evaluations.filter((item) => item.category === category);
    return {
      category,
      case_count: rows.length,
      baseline_accuracy: round(accuracy(rows, (item) => item.baseline.correct)),
      candidate_accuracy: round(accuracy(rows)),
    };
  });

  const summary = {
    case_count: evaluations.length,
    category_count: categories.size,
    maximum_session_count: maxSessions,
    maximum_revision_count: evaluations.reduce((max, item) => Math.max(max, item.revision_count), 0),
    baseline_accuracy: round(accuracy(evaluations, (item) => item.baseline.correct)),
    candidate_accuracy: round(accuracy(evaluations)),
    baseline_learning_gain_accuracy: round(baselineLearningAccuracy),
    candidate_learning_gain_accuracy: round(candidateLearningAccuracy),
    learning_lift: round(learningLift),
    premise_awareness_accuracy: round(accuracy(premiseCases)),
    retention_control_accuracy: round(accuracy(retentionCases)),
    retention_regression_count: retentionRegressions.length,
    superseded_leakage_count: supersededLeakage,
    forgotten_leakage_count: forgottenLeakage,
    expired_leakage_count: expiredLeakage,
    maximum_context_chars: maximumContextChars,
    average_context_chars: round(mean(evaluations.map((item) => item.candidate.context_chars)), 1),
  };

  const failures = [];
  if (summary.candidate_accuracy < number(limits.min_candidate_accuracy, 0.97)) failures.push("CANDIDATE_ACCURACY_BELOW_GATE");
  if (categoryMetrics.some((item) => item.candidate_accuracy < number(limits.min_category_accuracy, 0.95))) failures.push("CATEGORY_ACCURACY_BELOW_GATE");
  if (summary.candidate_learning_gain_accuracy < number(limits.min_learning_gain_accuracy, 0.97)) failures.push("LEARNING_GAIN_ACCURACY_BELOW_GATE");
  if (summary.learning_lift < number(limits.min_learning_lift, 0.5)) failures.push("LEARNING_LIFT_BELOW_GATE");
  if (summary.premise_awareness_accuracy < number(limits.min_premise_awareness_accuracy, 1)) failures.push("PREMISE_AWARENESS_BELOW_GATE");
  if (summary.retention_control_accuracy < number(limits.min_retention_control_accuracy, 1)) failures.push("RETENTION_CONTROL_BELOW_GATE");
  if (summary.retention_regression_count > number(limits.max_retention_regressions, 0)) failures.push("RETENTION_REGRESSION_DETECTED");
  if (summary.superseded_leakage_count > number(limits.max_superseded_leakage, 0)) failures.push("SUPERSEDED_EXPERIENCE_LEAKED");
  if (summary.forgotten_leakage_count > number(limits.max_forgotten_leakage, 0)) failures.push("FORGOTTEN_EXPERIENCE_LEAKED");
  if (summary.expired_leakage_count > number(limits.max_expired_leakage, 0)) failures.push("EXPIRED_EXPERIENCE_LEAKED");
  if (summary.maximum_context_chars > number(limits.max_context_chars_per_case, 3200)) failures.push("LEARNED_EXPERIENCE_CONTEXT_BUDGET_EXCEEDED");

  return {
    success: failures.length === 0,
    contract: AVANTIQO_LEARNED_EXPERIENCE_LIFT_CERTIFICATION_CONTRACT,
    status: failures.length === 0
      ? "LEARNED_EXPERIENCE_LIFT_CERTIFIED"
      : "LEARNED_EXPERIENCE_LIFT_REJECTED",
    summary,
    limits: { ...limits },
    failures,
    category_metrics: categoryMetrics,
    failed_cases: evaluations.filter((item) =>
      !item.candidate.correct ||
      item.candidate.superseded_hits.length ||
      item.candidate.forgotten_hits.length ||
      item.candidate.expired_hits.length ||
      item.candidate.context_chars > number(limits.max_context_chars_per_case, 3200)
    ),
    retention_regressions: retentionRegressions.map((item) => item.id),
    evaluations,
    governance: {
      paired_same_case_baseline_candidate: true,
      learned_experience_isolated_to_candidate_arm: true,
      production_data_required: false,
      customer_private_content_required: false,
      external_provider_required: false,
      gpu_required: false,
      wallet_effect: "NONE",
      automatic_memory_mutation: false,
      automatic_knowledge_promotion: false,
      automatic_model_weight_mutation: false,
      automatic_business_action_authorized: false,
      raw_reasoning_required: false,
    },
  };
}

export const AvantiqoLearnedExperienceLiftCertificationRuntime = Object.freeze({
  contract: AVANTIQO_LEARNED_EXPERIENCE_LIFT_CERTIFICATION_CONTRACT,
  limits: AVANTIQO_LEARNED_EXPERIENCE_LIFT_CERTIFICATION_LIMITS,
  evaluate: evaluateAvantiqoLearnedExperienceLiftCertification,
});
