import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  summarizeAvantiqoKnowledgeUtilityAttribution,
} from "@/lib/intelligence/runtime/AvantiqoKnowledgeUtilityAttributionRuntime";

export const AVANTIQO_KNOWLEDGE_UTILITY_FEEDBACK_CONTRACT =
  "AVANTIQO_KNOWLEDGE_UTILITY_FEEDBACK_V1";

const MEMORY_TABLE = "intelligence_memories";
const AGENDA_SCOPE = "platform_learning_agenda";
const MAX_AGENDA_ROWS = 5000;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function bounded(value, fallback = 0, min = 0, max = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function learningScopeId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function agendaTopicKey(row) {
  const metadata = object(row?.metadata);
  return text(metadata.topic_key || row?.subject, 240);
}

function agendaDomain(row) {
  return text(object(row?.metadata).knowledge_domain, 120).toLowerCase();
}

function capabilityDomain(capabilityKey) {
  return text(capabilityKey, 300)
    .toLowerCase()
    .replace(/[:/]/g, ".")
    .split(".")
    .filter(Boolean)[0] || null;
}

function patternMatchesAgenda(pattern, agenda) {
  if (pattern.signal_eligible !== true) return false;
  const topic = agendaTopicKey(agenda);
  if (topic && list(pattern.topic_keys).includes(topic)) return true;
  const domain = agendaDomain(agenda);
  if (!domain) return false;
  return capabilityDomain(pattern.capability_key) === domain;
}

function summarizeAgendaUtility(agenda, patterns) {
  const relevant = patterns.filter((pattern) => patternMatchesAgenda(pattern, agenda));
  const positive = relevant.filter((pattern) => pattern.signal === "POSITIVE_ASSOCIATION");
  const negative = relevant.filter((pattern) => pattern.signal === "NEGATIVE_ASSOCIATION");
  const mixed = relevant.filter((pattern) => pattern.signal === "MIXED_ASSOCIATION");
  const observations = relevant.reduce(
    (sum, pattern) => sum + Math.max(0, Number(pattern.total_observations || 0)),
    0,
  );

  let priorityDelta = 0;
  let cadenceMultiplier = 1;
  const signals = [];

  if (negative.length) {
    priorityDelta += Math.min(0.08, negative.length * 0.025);
    cadenceMultiplier = Math.min(cadenceMultiplier, 0.72);
    signals.push("ELIGIBLE_NEGATIVE_KNOWLEDGE_UTILITY_ASSOCIATION");
  }
  if (mixed.length) {
    priorityDelta += Math.min(0.03, mixed.length * 0.01);
    cadenceMultiplier = Math.min(cadenceMultiplier, 0.88);
    signals.push("ELIGIBLE_MIXED_KNOWLEDGE_UTILITY_ASSOCIATION");
  }
  if (positive.length && !negative.length && observations >= 16) {
    priorityDelta -= Math.min(0.025, positive.length * 0.008);
    cadenceMultiplier = Math.max(cadenceMultiplier, 1.08);
    signals.push("ELIGIBLE_POSITIVE_KNOWLEDGE_UTILITY_ASSOCIATION");
  }

  return {
    relevant_pattern_count: relevant.length,
    observation_count: observations,
    positive_pattern_count: positive.length,
    negative_pattern_count: negative.length,
    mixed_pattern_count: mixed.length,
    priority_delta: Number(priorityDelta.toFixed(4)),
    cadence_multiplier: Number(cadenceMultiplier.toFixed(4)),
    signals,
    relationship: "OBSERVATIONAL_ASSOCIATION_ONLY",
    causal_attribution_allowed: false,
  };
}

async function loadAgenda(learningId) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,subject,importance,metadata,updated_at")
    .eq("organization_id", learningId)
    .eq("memory_scope", AGENDA_SCOPE)
    .eq("active", true)
    .limit(MAX_AGENDA_ROWS);
  if (result.error) throw result.error;
  return list(result.data);
}

export async function applyAvantiqoKnowledgeUtilityFeedback({ apply = true } = {}) {
  const learningId = learningScopeId();
  if (!learningId) {
    return {
      success: true,
      contract: AVANTIQO_KNOWLEDGE_UTILITY_FEEDBACK_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      evaluated_agenda_count: 0,
      adjusted_agenda_count: 0,
    };
  }

  const [utility, agendaRows] = await Promise.all([
    summarizeAvantiqoKnowledgeUtilityAttribution(),
    loadAgenda(learningId),
  ]);
  const eligiblePatterns = list(utility.summaries).filter(
    (pattern) => pattern.signal_eligible === true,
  );
  const evaluations = agendaRows.map((agenda) => ({
    agenda,
    utility: summarizeAgendaUtility(agenda, eligiblePatterns),
  }));

  let adjusted = 0;
  if (apply) {
    const nowIso = new Date().toISOString();
    for (const item of evaluations) {
      const signal = item.utility;
      if (!signal.signals.length) continue;

      const agenda = item.agenda;
      const metadata = object(agenda.metadata);
      const currentImportance = bounded(agenda.importance, 0.7);
      const nextImportance = bounded(currentImportance + signal.priority_delta, currentImportance);
      const currentReviewDays = Math.max(1, Math.min(3650, Number(metadata.review_interval_days || 120)));
      const nextReviewDays = Math.max(
        14,
        Math.min(3650, Math.round(currentReviewDays * signal.cadence_multiplier)),
      );
      const nextMetadata = {
        ...metadata,
        review_interval_days: nextReviewDays,
        knowledge_utility_feedback: {
          contract: AVANTIQO_KNOWLEDGE_UTILITY_FEEDBACK_CONTRACT,
          ...signal,
          evaluated_at: nowIso,
          anti_overfitting_gate_passed: true,
          observational_only: true,
          product_actions_authorized: false,
        },
        priority_adjustment_source: "knowledge_utility_observational_feedback",
      };

      const update = await supabaseAdmin
        .from(MEMORY_TABLE)
        .update({
          importance: nextImportance,
          metadata: nextMetadata,
          updated_at: nowIso,
        })
        .eq("organization_id", learningId)
        .eq("memory_scope", AGENDA_SCOPE)
        .eq("id", agenda.id)
        .eq("updated_at", agenda.updated_at)
        .select("id")
        .maybeSingle();
      if (update.error) throw update.error;
      if (update.data?.id) adjusted += 1;
    }
  }

  return {
    success: true,
    contract: AVANTIQO_KNOWLEDGE_UTILITY_FEEDBACK_CONTRACT,
    status: eligiblePatterns.length
      ? "ELIGIBLE_UTILITY_SIGNALS_APPLIED"
      : "INSUFFICIENT_UTILITY_OBSERVATIONS",
    evaluated_agenda_count: evaluations.length,
    eligible_receipt_pattern_count: eligiblePatterns.length,
    adjusted_agenda_count: adjusted,
    highest_attention_agendas: evaluations
      .filter((item) => item.utility.signals.length)
      .sort((left, right) =>
        right.utility.negative_pattern_count - left.utility.negative_pattern_count ||
        right.utility.observation_count - left.utility.observation_count,
      )
      .slice(0, 12)
      .map((item) => ({
        topic_key: agendaTopicKey(item.agenda),
        signals: item.utility.signals,
        observation_count: item.utility.observation_count,
        relevant_pattern_count: item.utility.relevant_pattern_count,
        priority_delta: item.utility.priority_delta,
        cadence_multiplier: item.utility.cadence_multiplier,
      })),
    anti_overfitting: {
      utility_runtime_minimum_observations_per_signal:
        utility.anti_overfitting?.minimum_observations_per_signal || 8,
      utility_runtime_minimum_distinct_observation_days:
        utility.anti_overfitting?.minimum_distinct_observation_days || 3,
      bayesian_smoothing_required: true,
      ineligible_patterns_change_learning_policy: false,
      single_observation_changes_learning_policy: false,
      causal_claims_permitted: false,
    },
    governance: {
      observational_association_only: true,
      explicit_knowledge_provenance_required: true,
      product_outcomes_authorize_actions: false,
      customer_private_content_promoted: false,
      customer_scope_identifiers_persisted: false,
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

export const AvantiqoKnowledgeUtilityFeedbackRuntime = Object.freeze({
  contract: AVANTIQO_KNOWLEDGE_UTILITY_FEEDBACK_CONTRACT,
  apply: applyAvantiqoKnowledgeUtilityFeedback,
});
