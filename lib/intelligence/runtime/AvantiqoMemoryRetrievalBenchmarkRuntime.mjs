export const AVANTIQO_MEMORY_RETRIEVAL_BENCHMARK_CONTRACT =
  "AVANTIQO_MEMORY_RETRIEVAL_BENCHMARK_V1";

export const AVANTIQO_MEMORY_RETRIEVAL_BENCHMARK_LIMITS = Object.freeze({
  min_cases: 20,
  min_categories: 6,
  min_top1_accuracy: 0.95,
  min_recall_at_3: 0.95,
  min_mrr: 0.97,
  min_context_precision_at_3: 0.8,
  max_forbidden_retrievals: 0,
  max_negative_case_failures: 0,
  max_context_chars_per_case: 4800,
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

function reciprocalRank(retrievedIds, relevantIds) {
  const relevant = new Set(relevantIds);
  const index = retrievedIds.findIndex((id) => relevant.has(id));
  return index >= 0 ? 1 / (index + 1) : 0;
}

function recallAt(retrievedIds, relevantIds, k) {
  const relevant = new Set(relevantIds);
  if (!relevant.size) return 1;
  const hits = new Set(retrievedIds.slice(0, k).filter((id) => relevant.has(id)));
  return hits.size / relevant.size;
}

function precisionAt(retrievedIds, relevantIds, k) {
  const retrieved = retrievedIds.slice(0, k);
  if (!retrieved.length) return relevantIds.length ? 0 : 1;
  const relevant = new Set(relevantIds);
  const hits = retrieved.filter((id) => relevant.has(id)).length;
  return hits / retrieved.length;
}

function normalizeCase(value, index) {
  const id = text(value?.id, 240) || `case-${index + 1}`;
  const relevantIds = [...new Set(list(value?.relevant_ids).map((entry) => text(entry, 240)).filter(Boolean))];
  const forbiddenIds = [...new Set(list(value?.forbidden_ids).map((entry) => text(entry, 240)).filter(Boolean))];
  const expectNone = value?.expect_none === true;
  if (!expectNone && !relevantIds.length) {
    throw new Error(`AVANTIQO_MEMORY_RETRIEVAL_BENCHMARK_RELEVANCE_REQUIRED:${id}`);
  }
  return {
    ...value,
    id,
    category: text(value?.category, 120) || "general",
    relevant_ids: relevantIds,
    forbidden_ids: forbiddenIds,
    expect_none: expectNone,
  };
}

function normalizeRun(value = {}) {
  const retrievedIds = [...new Set(list(value.retrieved_ids).map((entry) => text(entry, 240)).filter(Boolean))];
  return {
    retrieved_ids: retrievedIds,
    context_chars: Math.max(0, number(value.context_chars)),
    raw_result_count: Math.max(0, number(value.raw_result_count, retrievedIds.length)),
  };
}

export function evaluateAvantiqoMemoryRetrievalBenchmark({
  cases = [],
  runCase,
  limits = AVANTIQO_MEMORY_RETRIEVAL_BENCHMARK_LIMITS,
} = {}) {
  if (typeof runCase !== "function") {
    throw new Error("AVANTIQO_MEMORY_RETRIEVAL_BENCHMARK_RUNNER_REQUIRED");
  }
  const normalizedCases = list(cases).map(normalizeCase);
  if (normalizedCases.length < number(limits.min_cases, 20)) {
    throw new Error("AVANTIQO_MEMORY_RETRIEVAL_BENCHMARK_CASE_COUNT_TOO_SMALL");
  }

  const categories = new Set(normalizedCases.map((item) => item.category));
  if (categories.size < number(limits.min_categories, 6)) {
    throw new Error("AVANTIQO_MEMORY_RETRIEVAL_BENCHMARK_CATEGORY_DIVERSITY_TOO_SMALL");
  }

  const evaluations = normalizedCases.map((benchmarkCase) => {
    const run = normalizeRun(runCase(benchmarkCase));
    const top1Hit = benchmarkCase.expect_none
      ? run.retrieved_ids.length === 0
      : benchmarkCase.relevant_ids.includes(run.retrieved_ids[0]);
    const negativeCasePass = benchmarkCase.expect_none
      ? run.retrieved_ids.length === 0
      : true;
    const forbiddenHits = run.retrieved_ids.filter((id) => benchmarkCase.forbidden_ids.includes(id));
    return {
      id: benchmarkCase.id,
      category: benchmarkCase.category,
      expect_none: benchmarkCase.expect_none,
      retrieved_ids: run.retrieved_ids,
      relevant_ids: benchmarkCase.relevant_ids,
      forbidden_ids: benchmarkCase.forbidden_ids,
      top1_hit: top1Hit,
      reciprocal_rank: benchmarkCase.expect_none
        ? (run.retrieved_ids.length === 0 ? 1 : 0)
        : reciprocalRank(run.retrieved_ids, benchmarkCase.relevant_ids),
      recall_at_3: benchmarkCase.expect_none
        ? (run.retrieved_ids.length === 0 ? 1 : 0)
        : recallAt(run.retrieved_ids, benchmarkCase.relevant_ids, 3),
      context_precision_at_3: benchmarkCase.expect_none
        ? (run.retrieved_ids.length === 0 ? 1 : 0)
        : precisionAt(run.retrieved_ids, benchmarkCase.relevant_ids, 3),
      forbidden_hits: forbiddenHits,
      negative_case_pass: negativeCasePass,
      context_chars: run.context_chars,
      raw_result_count: run.raw_result_count,
    };
  });

  const positive = evaluations.filter((item) => !item.expect_none);
  const negative = evaluations.filter((item) => item.expect_none);
  const forbiddenRetrievals = evaluations.reduce((sum, item) => sum + item.forbidden_hits.length, 0);
  const negativeCaseFailures = negative.filter((item) => !item.negative_case_pass).length;
  const maxContextChars = evaluations.reduce((max, item) => Math.max(max, item.context_chars), 0);

  const summary = {
    case_count: evaluations.length,
    positive_case_count: positive.length,
    negative_case_count: negative.length,
    category_count: categories.size,
    top1_accuracy: round(mean(evaluations.map((item) => item.top1_hit ? 1 : 0))),
    recall_at_3: round(mean(evaluations.map((item) => item.recall_at_3))),
    mean_reciprocal_rank: round(mean(evaluations.map((item) => item.reciprocal_rank))),
    context_precision_at_3: round(mean(evaluations.map((item) => item.context_precision_at_3))),
    forbidden_retrieval_count: forbiddenRetrievals,
    negative_case_failure_count: negativeCaseFailures,
    maximum_context_chars: maxContextChars,
    average_context_chars: round(mean(evaluations.map((item) => item.context_chars)), 1),
  };

  const failures = [];
  if (summary.top1_accuracy < number(limits.min_top1_accuracy, 0.95)) failures.push("TOP1_ACCURACY_BELOW_GATE");
  if (summary.recall_at_3 < number(limits.min_recall_at_3, 0.95)) failures.push("RECALL_AT_3_BELOW_GATE");
  if (summary.mean_reciprocal_rank < number(limits.min_mrr, 0.97)) failures.push("MRR_BELOW_GATE");
  if (summary.context_precision_at_3 < number(limits.min_context_precision_at_3, 0.8)) failures.push("CONTEXT_PRECISION_BELOW_GATE");
  if (summary.forbidden_retrieval_count > number(limits.max_forbidden_retrievals, 0)) failures.push("FORBIDDEN_MEMORY_RETRIEVED");
  if (summary.negative_case_failure_count > number(limits.max_negative_case_failures, 0)) failures.push("NEGATIVE_MEMORY_CASE_FAILED");
  if (summary.maximum_context_chars > number(limits.max_context_chars_per_case, 4800)) failures.push("CONTEXT_BUDGET_EXCEEDED");

  return {
    success: failures.length === 0,
    contract: AVANTIQO_MEMORY_RETRIEVAL_BENCHMARK_CONTRACT,
    status: failures.length === 0 ? "MEMORY_RETRIEVAL_CERTIFIED" : "MEMORY_RETRIEVAL_REJECTED",
    summary,
    limits: { ...limits },
    failures,
    failed_cases: evaluations.filter((item) =>
      !item.top1_hit ||
      item.forbidden_hits.length > 0 ||
      !item.negative_case_pass ||
      item.context_chars > number(limits.max_context_chars_per_case, 4800)
    ),
    category_metrics: [...categories].sort().map((category) => {
      const rows = evaluations.filter((item) => item.category === category);
      return {
        category,
        case_count: rows.length,
        top1_accuracy: round(mean(rows.map((item) => item.top1_hit ? 1 : 0))),
        recall_at_3: round(mean(rows.map((item) => item.recall_at_3))),
        mean_reciprocal_rank: round(mean(rows.map((item) => item.reciprocal_rank))),
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
      raw_reasoning_required: false,
    },
  };
}

export const AvantiqoMemoryRetrievalBenchmarkRuntime = Object.freeze({
  contract: AVANTIQO_MEMORY_RETRIEVAL_BENCHMARK_CONTRACT,
  limits: AVANTIQO_MEMORY_RETRIEVAL_BENCHMARK_LIMITS,
  evaluate: evaluateAvantiqoMemoryRetrievalBenchmark,
});
