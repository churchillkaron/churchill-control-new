export const AVANTIQO_LONG_HORIZON_MEMORY_CERTIFICATION_CONTRACT =
  "AVANTIQO_LONG_HORIZON_MEMORY_CERTIFICATION_V1";

export const AVANTIQO_LONG_HORIZON_MEMORY_CERTIFICATION_LIMITS = Object.freeze({
  min_cases: 30,
  min_categories: 8,
  min_sessions: 4,
  min_state_accuracy: 0.97,
  min_cross_session_accuracy: 0.97,
  min_revision_accuracy: 0.97,
  min_retention_accuracy: 0.97,
  min_premise_awareness_accuracy: 0.97,
  min_compaction_restart_accuracy: 0.97,
  max_superseded_leakage: 0,
  max_forgotten_leakage: 0,
  max_expired_leakage: 0,
  max_context_chars_per_case: 4200,
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
  const id = text(value?.id, 240) || `long-horizon-${index + 1}`;
  const expected = text(value?.expected_id, 240);
  if (!expected) {
    throw new Error(`AVANTIQO_LONG_HORIZON_MEMORY_EXPECTED_STATE_REQUIRED:${id}`);
  }
  return {
    ...value,
    id,
    category: text(value?.category, 120) || "general",
    expected_id: expected,
    superseded_ids: [...new Set(list(value?.superseded_ids).map((entry) => text(entry, 240)).filter(Boolean))],
    forgotten_ids: [...new Set(list(value?.forgotten_ids).map((entry) => text(entry, 240)).filter(Boolean))],
    expired_ids: [...new Set(list(value?.expired_ids).map((entry) => text(entry, 240)).filter(Boolean))],
    session_count: Math.max(1, Math.floor(number(value?.session_count, 1))),
    revision_count: Math.max(0, Math.floor(number(value?.revision_count, 0))),
    cross_session: value?.cross_session === true,
    retention: value?.retention === true,
    premise_awareness: value?.premise_awareness === true,
    compaction_restart: value?.compaction_restart === true,
  };
}

function normalizeRun(value = {}) {
  return {
    retrieved_ids: [...new Set(list(value.retrieved_ids).map((entry) => text(entry, 240)).filter(Boolean))],
    context_chars: Math.max(0, number(value.context_chars)),
    raw_result_count: Math.max(0, number(value.raw_result_count)),
  };
}

function metric(rows, predicate) {
  if (!rows.length) return 1;
  return mean(rows.map((item) => predicate(item) ? 1 : 0));
}

export function evaluateAvantiqoLongHorizonMemoryCertification({
  cases = [],
  runCase,
  limits = AVANTIQO_LONG_HORIZON_MEMORY_CERTIFICATION_LIMITS,
} = {}) {
  if (typeof runCase !== "function") {
    throw new Error("AVANTIQO_LONG_HORIZON_MEMORY_RUNNER_REQUIRED");
  }
  const normalizedCases = list(cases).map(normalizeCase);
  if (normalizedCases.length < number(limits.min_cases, 30)) {
    throw new Error("AVANTIQO_LONG_HORIZON_MEMORY_CASE_COUNT_TOO_SMALL");
  }
  const categories = new Set(normalizedCases.map((item) => item.category));
  if (categories.size < number(limits.min_categories, 8)) {
    throw new Error("AVANTIQO_LONG_HORIZON_MEMORY_CATEGORY_DIVERSITY_TOO_SMALL");
  }
  const maxSessions = normalizedCases.reduce((max, item) => Math.max(max, item.session_count), 0);
  if (maxSessions < number(limits.min_sessions, 4)) {
    throw new Error("AVANTIQO_LONG_HORIZON_MEMORY_SESSION_DEPTH_TOO_SMALL");
  }

  const evaluations = normalizedCases.map((benchmarkCase) => {
    const run = normalizeRun(runCase(benchmarkCase));
    const top1 = run.retrieved_ids[0] || null;
    const supersededHits = run.retrieved_ids.filter((id) => benchmarkCase.superseded_ids.includes(id));
    const forgottenHits = run.retrieved_ids.filter((id) => benchmarkCase.forgotten_ids.includes(id));
    const expiredHits = run.retrieved_ids.filter((id) => benchmarkCase.expired_ids.includes(id));
    const stateCorrect = top1 === benchmarkCase.expected_id;
    return {
      id: benchmarkCase.id,
      category: benchmarkCase.category,
      session_count: benchmarkCase.session_count,
      revision_count: benchmarkCase.revision_count,
      cross_session: benchmarkCase.cross_session,
      retention: benchmarkCase.retention,
      premise_awareness: benchmarkCase.premise_awareness,
      compaction_restart: benchmarkCase.compaction_restart,
      expected_id: benchmarkCase.expected_id,
      retrieved_ids: run.retrieved_ids,
      state_correct: stateCorrect,
      superseded_hits: supersededHits,
      forgotten_hits: forgottenHits,
      expired_hits: expiredHits,
      context_chars: run.context_chars,
      raw_result_count: run.raw_result_count,
    };
  });

  const revisionCases = evaluations.filter((item) => item.revision_count > 0);
  const crossSessionCases = evaluations.filter((item) => item.cross_session);
  const retentionCases = evaluations.filter((item) => item.retention);
  const premiseCases = evaluations.filter((item) => item.premise_awareness);
  const compactionCases = evaluations.filter((item) => item.compaction_restart);
  const supersededLeakage = evaluations.reduce((sum, item) => sum + item.superseded_hits.length, 0);
  const forgottenLeakage = evaluations.reduce((sum, item) => sum + item.forgotten_hits.length, 0);
  const expiredLeakage = evaluations.reduce((sum, item) => sum + item.expired_hits.length, 0);
  const maximumContextChars = evaluations.reduce((max, item) => Math.max(max, item.context_chars), 0);

  const summary = {
    case_count: evaluations.length,
    category_count: categories.size,
    maximum_session_count: maxSessions,
    maximum_revision_count: evaluations.reduce((max, item) => Math.max(max, item.revision_count), 0),
    state_accuracy: round(metric(evaluations, (item) => item.state_correct)),
    cross_session_accuracy: round(metric(crossSessionCases, (item) => item.state_correct)),
    revision_accuracy: round(metric(revisionCases, (item) => item.state_correct)),
    retention_accuracy: round(metric(retentionCases, (item) => item.state_correct)),
    premise_awareness_accuracy: round(metric(premiseCases, (item) => item.state_correct)),
    compaction_restart_accuracy: round(metric(compactionCases, (item) => item.state_correct)),
    superseded_leakage_count: supersededLeakage,
    forgotten_leakage_count: forgottenLeakage,
    expired_leakage_count: expiredLeakage,
    maximum_context_chars: maximumContextChars,
    average_context_chars: round(mean(evaluations.map((item) => item.context_chars)), 1),
  };

  const failures = [];
  if (summary.state_accuracy < number(limits.min_state_accuracy, 0.97)) failures.push("STATE_ACCURACY_BELOW_GATE");
  if (summary.cross_session_accuracy < number(limits.min_cross_session_accuracy, 0.97)) failures.push("CROSS_SESSION_ACCURACY_BELOW_GATE");
  if (summary.revision_accuracy < number(limits.min_revision_accuracy, 0.97)) failures.push("REVISION_ACCURACY_BELOW_GATE");
  if (summary.retention_accuracy < number(limits.min_retention_accuracy, 0.97)) failures.push("RETENTION_ACCURACY_BELOW_GATE");
  if (summary.premise_awareness_accuracy < number(limits.min_premise_awareness_accuracy, 0.97)) failures.push("PREMISE_AWARENESS_BELOW_GATE");
  if (summary.compaction_restart_accuracy < number(limits.min_compaction_restart_accuracy, 0.97)) failures.push("COMPACTION_RESTART_BELOW_GATE");
  if (summary.superseded_leakage_count > number(limits.max_superseded_leakage, 0)) failures.push("SUPERSEDED_STATE_LEAKED");
  if (summary.forgotten_leakage_count > number(limits.max_forgotten_leakage, 0)) failures.push("FORGOTTEN_STATE_LEAKED");
  if (summary.expired_leakage_count > number(limits.max_expired_leakage, 0)) failures.push("EXPIRED_STATE_LEAKED");
  if (summary.maximum_context_chars > number(limits.max_context_chars_per_case, 4200)) failures.push("LONG_HORIZON_CONTEXT_BUDGET_EXCEEDED");

  return {
    success: failures.length === 0,
    contract: AVANTIQO_LONG_HORIZON_MEMORY_CERTIFICATION_CONTRACT,
    status: failures.length === 0
      ? "LONG_HORIZON_MEMORY_CERTIFIED"
      : "LONG_HORIZON_MEMORY_REJECTED",
    summary,
    limits: { ...limits },
    failures,
    failed_cases: evaluations.filter((item) =>
      !item.state_correct ||
      item.superseded_hits.length ||
      item.forgotten_hits.length ||
      item.expired_hits.length ||
      item.context_chars > number(limits.max_context_chars_per_case, 4200)
    ),
    category_metrics: [...categories].sort().map((category) => {
      const rows = evaluations.filter((item) => item.category === category);
      return {
        category,
        case_count: rows.length,
        state_accuracy: round(metric(rows, (item) => item.state_correct)),
        superseded_leakage_count: rows.reduce((sum, item) => sum + item.superseded_hits.length, 0),
        forgotten_leakage_count: rows.reduce((sum, item) => sum + item.forgotten_hits.length, 0),
        expired_leakage_count: rows.reduce((sum, item) => sum + item.expired_hits.length, 0),
      };
    }),
    evaluations,
    governance: {
      production_data_required: false,
      customer_private_content_required: false,
      external_provider_required: false,
      gpu_required: false,
      wallet_effect: "NONE",
      automatic_memory_mutation: false,
      automatic_model_promotion: false,
      automatic_business_action_authorized: false,
      raw_reasoning_required: false,
    },
  };
}

export const AvantiqoLongHorizonMemoryCertificationRuntime = Object.freeze({
  contract: AVANTIQO_LONG_HORIZON_MEMORY_CERTIFICATION_CONTRACT,
  limits: AVANTIQO_LONG_HORIZON_MEMORY_CERTIFICATION_LIMITS,
  evaluate: evaluateAvantiqoLongHorizonMemoryCertification,
});
