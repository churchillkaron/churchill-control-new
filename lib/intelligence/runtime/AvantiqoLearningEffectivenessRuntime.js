import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  summarizeAvantiqoVerifiedExecutionOutcomes,
} from "@/lib/intelligence/runtime/AvantiqoVerifiedOutcomeLearningRuntime";

export const AVANTIQO_LEARNING_EFFECTIVENESS_CONTRACT =
  "AVANTIQO_LEARNING_EFFECTIVENESS_V1";

const MEMORY_TABLE = "intelligence_memories";
const AGENDA_SCOPE = "platform_learning_agenda";
const RUN_SCOPE = "platform_learning_runs";
const KNOWLEDGE_SCOPE = "platform_knowledge";
const GAP_SCOPE = "platform_learning_gaps";
const DEFAULT_LOOKBACK_DAYS = 120;
const MAX_LOOKBACK_DAYS = 730;
const DAY_MS = 24 * 60 * 60 * 1000;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function bounded(value, fallback = 0, min = 0, max = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function dateAgeDays(value, nowMs = Date.now()) {
  const parsed = Date.parse(text(value, 120));
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - parsed) / DAY_MS);
}

async function loadState(organizationId, lookbackDays) {
  const cutoff = new Date(Date.now() - lookbackDays * DAY_MS).toISOString();
  const [agendas, runs, knowledge, gaps] = await Promise.all([
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,subject,importance,metadata,updated_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", AGENDA_SCOPE)
      .eq("active", true)
      .limit(5000),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,subject,content,metadata,created_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", RUN_SCOPE)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,subject,confidence,source,active,valid_until,metadata,created_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", KNOWLEDGE_SCOPE)
      .eq("active", true)
      .limit(5000),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,subject,importance,metadata,updated_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", GAP_SCOPE)
      .eq("active", true)
      .limit(5000),
  ]);
  for (const result of [agendas, runs, knowledge, gaps]) {
    if (result.error) throw result.error;
  }
  return {
    agendas: list(agendas.data),
    runs: list(runs.data),
    knowledge: list(knowledge.data),
    gaps: list(gaps.data),
  };
}

function topicKey(row) {
  return text(object(row?.metadata).topic_key || row?.subject, 240);
}

function externalKnowledgeForTopic(state, key) {
  return state.knowledge.filter((row) => {
    return (
      topicKey(row) === key &&
      row.source !== "avantiqo_canonical_product_knowledge" &&
      row.active === true &&
      !row.superseded_at &&
      !row.superseded_by &&
      !row.forgotten_at
    );
  });
}

function gapForTopic(state, key) {
  return state.gaps.find((row) => topicKey(row) === key) || null;
}

function runsForTopic(state, key) {
  return state.runs.filter((row) => topicKey(row) === key || text(row.subject, 240) === key);
}

function classifyRun(row) {
  const metadata = object(row.metadata);
  const status = text(metadata.status, 80).toUpperCase();
  const claimCount = Math.max(0, Number(metadata.claim_count || 0));
  const sourceCount = Math.max(0, Number(metadata.source_count || 0));
  return {
    status,
    claim_count: claimCount,
    source_count: sourceCount,
    productive: status === "COMPLETED" && claimCount > 0,
    failed: status === "ERROR",
    zero_yield: status === "COMPLETED" && claimCount === 0,
    created_at: row.created_at || row.updated_at || null,
  };
}

function outcomeForTopic(agenda, summaries) {
  const metadata = object(agenda.metadata);
  const domain = text(metadata.knowledge_domain, 120).toLowerCase();
  const workspaceId = text(metadata.workspace_id, 180).toLowerCase();
  const relevant = list(summaries).filter((summary) => {
    const capability = text(summary?.capability_key, 300).toLowerCase();
    const capabilityDomain = text(summary?.capability_domain, 120).toLowerCase();
    if (workspaceId && capability.includes(workspaceId)) return true;
    return Boolean(domain && capabilityDomain === domain);
  });
  const successCount = relevant.reduce(
    (sum, item) => sum + Math.max(0, Number(item?.verified_success_count || 0)),
    0,
  );
  const failureCount = relevant.reduce(
    (sum, item) => sum + Math.max(0, Number(item?.verified_failure_count || 0)),
    0,
  );
  const total = successCount + failureCount;
  const rawSuccessRate = total ? successCount / total : null;
  const smoothedSuccessRate = total ? (successCount + 2) / (total + 4) : null;
  const unstableCapabilities = relevant.filter((item) =>
    list(item?.signals).includes("PRODUCT_OUTCOME_UNSTABLE") ||
    list(item?.signals).includes("REPEATED_VERIFIED_FAILURES"),
  );
  const strongCapabilities = relevant.filter((item) =>
    list(item?.signals).includes("PRODUCT_OUTCOME_STRONG"),
  );
  return {
    observational_only: true,
    causal_attribution: false,
    matched_capability_count: relevant.length,
    total_verified_outcomes: total,
    verified_success_count: successCount,
    verified_failure_count: failureCount,
    success_rate: rawSuccessRate === null ? null : Number(rawSuccessRate.toFixed(4)),
    smoothed_success_rate: smoothedSuccessRate === null
      ? null
      : Number(smoothedSuccessRate.toFixed(4)),
    unstable_capability_count: unstableCapabilities.length,
    strong_capability_count: strongCapabilities.length,
  };
}

function topicEffectiveness({ agenda, state, nowMs, outcomeSummaries }) {
  const key = topicKey(agenda);
  const metadata = object(agenda.metadata);
  const runs = runsForTopic(state, key).map(classifyRun);
  const knowledge = externalKnowledgeForTopic(state, key);
  const gap = gapForTopic(state, key);
  const productOutcome = outcomeForTopic(agenda, outcomeSummaries);
  const recentRuns = runs.slice(0, 12);
  const productiveRuns = recentRuns.filter((run) => run.productive);
  const failedRuns = recentRuns.filter((run) => run.failed);
  const zeroYieldRuns = recentRuns.filter((run) => run.zero_yield);
  const totalClaims = productiveRuns.reduce((sum, run) => sum + run.claim_count, 0);
  const totalSources = productiveRuns.reduce((sum, run) => sum + run.source_count, 0);
  const successRate = recentRuns.length
    ? productiveRuns.length / recentRuns.length
    : null;
  const zeroYieldRate = recentRuns.length
    ? zeroYieldRuns.length / recentRuns.length
    : null;
  const failureRate = recentRuns.length
    ? failedRuns.length / recentRuns.length
    : null;
  const avgClaimsPerProductiveRun = productiveRuns.length
    ? totalClaims / productiveRuns.length
    : 0;
  const avgSourcesPerProductiveRun = productiveRuns.length
    ? totalSources / productiveRuns.length
    : 0;
  const confidences = knowledge.map((row) => bounded(row.confidence, 0));
  const avgKnowledgeConfidence = confidences.length
    ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
    : 0;
  const ages = knowledge.map((row) => {
    const item = object(row.metadata);
    return dateAgeDays(item.verified_at || row.updated_at || row.created_at, nowMs);
  });
  const newestKnowledgeAgeDays = ages.length ? Math.min(...ages) : null;
  const oldestKnowledgeAgeDays = ages.length ? Math.max(...ages) : null;
  const gapMetadata = object(gap?.metadata);
  const coverageScore = bounded(gapMetadata.coverage_score, 0);
  const runtimeSignalCount = Math.max(0, Number(gapMetadata.runtime_training_signal_count || 0));

  const evidenceYieldScore = bounded(
    Math.min(1, avgClaimsPerProductiveRun / 4) * 0.55 +
      Math.min(1, avgSourcesPerProductiveRun / 4) * 0.25 +
      avgKnowledgeConfidence * 0.2,
    0,
  );
  const reliabilityScore = recentRuns.length
    ? bounded(
        (successRate || 0) * 0.7 +
          (1 - (failureRate || 0)) * 0.2 +
          (1 - (zeroYieldRate || 0)) * 0.1,
        0,
      )
    : 0.45;
  const effectivenessScore = bounded(
    coverageScore * 0.5 +
      evidenceYieldScore * 0.3 +
      reliabilityScore * 0.2,
    0,
  );

  const signals = [];
  if (!recentRuns.length) signals.push("NO_RECENT_LEARNING_RUNS");
  if ((failureRate || 0) >= 0.4) signals.push("HIGH_RESEARCH_FAILURE_RATE");
  if ((zeroYieldRate || 0) >= 0.5) signals.push("REPEATED_ZERO_YIELD_RESEARCH");
  if (coverageScore < 0.5) signals.push("LOW_VERIFIED_COVERAGE");
  if (avgKnowledgeConfidence > 0 && avgKnowledgeConfidence < 0.78) {
    signals.push("LOW_KNOWLEDGE_CONFIDENCE");
  }
  if (runtimeSignalCount > 0) signals.push("RUNTIME_FAILURE_RECOVERY_SIGNAL_PRESENT");
  if (newestKnowledgeAgeDays !== null && newestKnowledgeAgeDays > 180) {
    signals.push("KNOWLEDGE_FRESHNESS_WEAK");
  }
  if (
    productOutcome.total_verified_outcomes >= 3 &&
    productOutcome.smoothed_success_rate !== null &&
    productOutcome.smoothed_success_rate < 0.8
  ) {
    signals.push("VERIFIED_PRODUCT_OUTCOME_ATTENTION_REQUIRED");
  }
  if (productOutcome.unstable_capability_count > 0) {
    signals.push("VERIFIED_PRODUCT_CAPABILITY_UNSTABLE");
  }
  if (effectivenessScore >= 0.82 && coverageScore >= 0.8) {
    signals.push("LEARNING_EFFECTIVE_AND_COVERAGE_STRONG");
  }

  let priorityAdjustment = 0;
  if (coverageScore < 0.5) priorityAdjustment += 0.08;
  if (runtimeSignalCount > 0) priorityAdjustment += Math.min(0.08, runtimeSignalCount * 0.02);
  if (
    productOutcome.total_verified_outcomes >= 3 &&
    productOutcome.smoothed_success_rate !== null &&
    productOutcome.smoothed_success_rate < 0.8
  ) {
    priorityAdjustment += 0.08;
  }
  if (productOutcome.unstable_capability_count > 0) {
    priorityAdjustment += Math.min(0.06, productOutcome.unstable_capability_count * 0.02);
  }
  if ((failureRate || 0) >= 0.4) priorityAdjustment -= 0.04;
  if ((zeroYieldRate || 0) >= 0.5) priorityAdjustment -= 0.03;
  if (
    productOutcome.total_verified_outcomes >= 10 &&
    productOutcome.smoothed_success_rate !== null &&
    productOutcome.smoothed_success_rate >= 0.95 &&
    coverageScore >= 0.8 &&
    effectivenessScore >= 0.82
  ) {
    priorityAdjustment -= 0.02;
  }
  if (effectivenessScore >= 0.82 && coverageScore >= 0.8) priorityAdjustment -= 0.08;
  priorityAdjustment = bounded(priorityAdjustment, 0, -0.15, 0.15);

  const currentImportance = bounded(agenda.importance, 0.7);
  const recommendedImportance = bounded(currentImportance + priorityAdjustment, currentImportance);
  const currentReviewDays = boundedInteger(metadata.review_interval_days, 120, 1, 3650);
  let recommendedReviewDays = currentReviewDays;
  if (coverageScore < 0.5 || runtimeSignalCount > 0) {
    recommendedReviewDays = Math.max(14, Math.round(currentReviewDays * 0.65));
  }
  if (
    productOutcome.total_verified_outcomes >= 3 &&
    productOutcome.smoothed_success_rate !== null &&
    productOutcome.smoothed_success_rate < 0.8
  ) {
    recommendedReviewDays = Math.max(14, Math.round(recommendedReviewDays * 0.65));
  }
  if (effectivenessScore >= 0.82 && coverageScore >= 0.8) {
    recommendedReviewDays = Math.min(3650, Math.round(currentReviewDays * 1.35));
  }
  if ((failureRate || 0) >= 0.4 || (zeroYieldRate || 0) >= 0.5) {
    recommendedReviewDays = Math.min(3650, Math.max(recommendedReviewDays, 45));
  }

  return {
    key,
    agenda,
    gap,
    recent_run_count: recentRuns.length,
    productive_run_count: productiveRuns.length,
    failed_run_count: failedRuns.length,
    zero_yield_run_count: zeroYieldRuns.length,
    success_rate: successRate === null ? null : Number(successRate.toFixed(4)),
    failure_rate: failureRate === null ? null : Number(failureRate.toFixed(4)),
    zero_yield_rate: zeroYieldRate === null ? null : Number(zeroYieldRate.toFixed(4)),
    average_claims_per_productive_run: Number(avgClaimsPerProductiveRun.toFixed(4)),
    average_sources_per_productive_run: Number(avgSourcesPerProductiveRun.toFixed(4)),
    knowledge_claim_count: knowledge.length,
    average_knowledge_confidence: Number(avgKnowledgeConfidence.toFixed(4)),
    newest_knowledge_age_days: newestKnowledgeAgeDays === null
      ? null
      : Number(newestKnowledgeAgeDays.toFixed(2)),
    oldest_knowledge_age_days: oldestKnowledgeAgeDays === null
      ? null
      : Number(oldestKnowledgeAgeDays.toFixed(2)),
    coverage_score: Number(coverageScore.toFixed(4)),
    runtime_training_signal_count: runtimeSignalCount,
    product_outcome: productOutcome,
    evidence_yield_score: Number(evidenceYieldScore.toFixed(4)),
    reliability_score: Number(reliabilityScore.toFixed(4)),
    effectiveness_score: Number(effectivenessScore.toFixed(4)),
    signals,
    current_importance: Number(currentImportance.toFixed(4)),
    recommended_importance: Number(recommendedImportance.toFixed(4)),
    current_review_interval_days: currentReviewDays,
    recommended_review_interval_days: recommendedReviewDays,
  };
}

async function applyRecommendations(organizationId, items) {
  let adjusted = 0;
  const nowIso = new Date().toISOString();
  for (const item of items) {
    const agenda = item.agenda;
    const metadata = object(agenda.metadata);
    const importanceChanged = Math.abs(item.recommended_importance - item.current_importance) >= 0.005;
    const reviewChanged = item.recommended_review_interval_days !== item.current_review_interval_days;
    if (!importanceChanged && !reviewChanged) continue;
    const nextMetadata = {
      ...metadata,
      review_interval_days: item.recommended_review_interval_days,
      learning_effectiveness: {
        contract: AVANTIQO_LEARNING_EFFECTIVENESS_CONTRACT,
        effectiveness_score: item.effectiveness_score,
        evidence_yield_score: item.evidence_yield_score,
        reliability_score: item.reliability_score,
        coverage_score: item.coverage_score,
        recent_run_count: item.recent_run_count,
        success_rate: item.success_rate,
        failure_rate: item.failure_rate,
        zero_yield_rate: item.zero_yield_rate,
        runtime_training_signal_count: item.runtime_training_signal_count,
        product_outcome: item.product_outcome,
        outcome_relationship: "OBSERVATIONAL_CORRELATION_ONLY",
        causal_attribution_allowed: false,
        signals: item.signals,
        evaluated_at: nowIso,
      },
      priority_adjustment_source: "learning_effectiveness_feedback",
    };
    const result = await supabaseAdmin
      .from(MEMORY_TABLE)
      .update({
        importance: item.recommended_importance,
        metadata: nextMetadata,
        updated_at: nowIso,
      })
      .eq("organization_id", organizationId)
      .eq("memory_scope", AGENDA_SCOPE)
      .eq("id", agenda.id)
      .eq("updated_at", agenda.updated_at)
      .select("id")
      .maybeSingle();
    if (result.error) throw result.error;
    if (result.data?.id) adjusted += 1;
  }
  return adjusted;
}

export async function evaluateAvantiqoLearningEffectiveness({
  organizationId = null,
  lookbackDays = DEFAULT_LOOKBACK_DAYS,
  apply = true,
} = {}) {
  const organization = text(organizationId, 160) || learningOrganizationId();
  if (!organization) {
    return {
      success: true,
      contract: AVANTIQO_LEARNING_EFFECTIVENESS_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      evaluated_topic_count: 0,
      adjusted_topic_count: 0,
    };
  }

  const lookback = boundedInteger(lookbackDays, DEFAULT_LOOKBACK_DAYS, 7, MAX_LOOKBACK_DAYS);
  const [state, verifiedOutcomes] = await Promise.all([
    loadState(organization, lookback),
    summarizeAvantiqoVerifiedExecutionOutcomes({ lookbackDays: lookback }),
  ]);
  const outcomeSummaries = verifiedOutcomes.available === true
    ? list(verifiedOutcomes.summaries)
    : [];
  const nowMs = Date.now();
  const items = state.agendas.map((agenda) => topicEffectiveness({
    agenda,
    state,
    nowMs,
    outcomeSummaries,
  }));
  const adjusted = apply ? await applyRecommendations(organization, items) : 0;
  const averageEffectiveness = items.length
    ? items.reduce((sum, item) => sum + item.effectiveness_score, 0) / items.length
    : 0;
  const weak = items.filter((item) => item.effectiveness_score < 0.5);
  const strong = items.filter((item) => item.effectiveness_score >= 0.82 && item.coverage_score >= 0.8);
  const outcomeAttention = items.filter((item) =>
    item.signals.includes("VERIFIED_PRODUCT_OUTCOME_ATTENTION_REQUIRED") ||
    item.signals.includes("VERIFIED_PRODUCT_CAPABILITY_UNSTABLE"),
  );

  return {
    success: true,
    contract: AVANTIQO_LEARNING_EFFECTIVENESS_CONTRACT,
    status: weak.length || outcomeAttention.length
      ? "LEARNING_EFFECTIVENESS_GAPS_IDENTIFIED"
      : "LEARNING_EFFECTIVENESS_HEALTHY",
    lookback_days: lookback,
    evaluated_topic_count: items.length,
    adjusted_topic_count: adjusted,
    average_effectiveness_score: Number(averageEffectiveness.toFixed(4)),
    weak_topic_count: weak.length,
    strong_topic_count: strong.length,
    product_outcome_attention_topic_count: outcomeAttention.length,
    verified_product_outcome_capability_count: outcomeSummaries.length,
    highest_attention_topics: items
      .slice()
      .sort((left, right) => {
        const leftOutcomeNeed = left.product_outcome.total_verified_outcomes >= 3
          ? 1 - (left.product_outcome.smoothed_success_rate ?? 1)
          : 0;
        const rightOutcomeNeed = right.product_outcome.total_verified_outcomes >= 3
          ? 1 - (right.product_outcome.smoothed_success_rate ?? 1)
          : 0;
        const leftNeed = (1 - left.effectiveness_score) +
          left.runtime_training_signal_count * 0.05 +
          leftOutcomeNeed * 0.3;
        const rightNeed = (1 - right.effectiveness_score) +
          right.runtime_training_signal_count * 0.05 +
          rightOutcomeNeed * 0.3;
        return rightNeed - leftNeed;
      })
      .slice(0, 12)
      .map((item) => ({
        topic_key: item.key,
        effectiveness_score: item.effectiveness_score,
        coverage_score: item.coverage_score,
        evidence_yield_score: item.evidence_yield_score,
        reliability_score: item.reliability_score,
        runtime_training_signal_count: item.runtime_training_signal_count,
        product_outcome: item.product_outcome,
        signals: item.signals,
        recommended_importance: item.recommended_importance,
        recommended_review_interval_days: item.recommended_review_interval_days,
      })),
    governance: {
      self_adjusting_learning_priority: true,
      self_adjusting_review_cadence: true,
      verified_learning_runs_only: true,
      verified_product_outcomes_influence_priority: true,
      product_outcome_relationship: "OBSERVATIONAL_CORRELATION_ONLY",
      causal_attribution_allowed: false,
      product_outcomes_authorize_actions: false,
      customer_private_content_promoted: false,
      raw_reasoning_persisted: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      gpu_execution_performed: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoLearningEffectivenessRuntime = Object.freeze({
  contract: AVANTIQO_LEARNING_EFFECTIVENESS_CONTRACT,
  evaluate: evaluateAvantiqoLearningEffectiveness,
});
