import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  observeVerifiedExecutionFailure,
  observeVerifiedExecutionSuccess,
} from "@/lib/operator/runtime/IntelligenceFailureLearningPolicy";

export const AVANTIQO_VERIFIED_OUTCOME_LEARNING_CONTRACT =
  "AVANTIQO_VERIFIED_OUTCOME_LEARNING_V1";

const MEMORY_TABLE = "intelligence_memories";
const OUTCOME_SCOPE = "platform_learning_outcomes";
const DEFAULT_LOOKBACK_DAYS = 120;
const MAX_LOOKBACK_DAYS = 730;
const DEFAULT_LIMIT = 5000;
const MAX_LIMIT = 20000;
const RETENTION_DAYS = 365;
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

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function capabilityMode(execution = {}) {
  return text(execution?.capability?.mode, 80).toLowerCase() || null;
}

function capabilityDomain(capabilityKey) {
  const key = text(capabilityKey, 300).toLowerCase();
  if (!key) return null;
  const normalized = key.replace(/[:/]/g, ".");
  return normalized.split(".").filter(Boolean)[0] || null;
}

function outcomeObservation(execution = {}) {
  const success = observeVerifiedExecutionSuccess(execution);
  if (success) {
    return {
      capability_key: success.capability_key,
      outcome: "VERIFIED_SUCCESS",
      verification_mode: success.verification_mode,
      failure_fingerprint: null,
    };
  }

  const failure = observeVerifiedExecutionFailure(execution);
  if (failure) {
    return {
      capability_key: failure.capability_key,
      outcome: "VERIFIED_FAILURE",
      verification_mode: "observed_execution_failure",
      failure_fingerprint: text(failure.fingerprint, 120) || null,
    };
  }

  return null;
}

export async function recordAvantiqoVerifiedExecutionOutcome({ execution = {} } = {}) {
  const learningScopeId = learningOrganizationId();
  if (!learningScopeId) {
    return {
      contract: AVANTIQO_VERIFIED_OUTCOME_LEARNING_CONTRACT,
      written: false,
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
    };
  }

  const observation = outcomeObservation(execution);
  if (!observation) {
    return {
      contract: AVANTIQO_VERIFIED_OUTCOME_LEARNING_CONTRACT,
      written: false,
      reason: "NO_VERIFIED_EXECUTION_OUTCOME",
    };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const validUntil = new Date(now.getTime() + RETENTION_DAYS * DAY_MS).toISOString();
  const domain = capabilityDomain(observation.capability_key);
  const row = {
    organization_id: learningScopeId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: OUTCOME_SCOPE,
    memory_key: `verified-outcome:${randomUUID()}`,
    memory_type: observation.outcome === "VERIFIED_SUCCESS" ? "completed_step" : "blocker",
    subject: observation.capability_key,
    content: observation.outcome === "VERIFIED_SUCCESS"
      ? `Verified successful execution outcome observed for ${observation.capability_key}.`
      : `Verified failed execution outcome observed for ${observation.capability_key}.`,
    importance: observation.outcome === "VERIFIED_SUCCESS" ? 0.62 : 0.78,
    confidence: 1,
    source: "verified_execution_outcome_learning",
    active: true,
    valid_until: validUntil,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_VERIFIED_OUTCOME_LEARNING_CONTRACT,
      outcome: observation.outcome,
      capability_key: observation.capability_key,
      capability_domain: domain,
      capability_mode: capabilityMode(execution),
      verification_mode: observation.verification_mode,
      failure_fingerprint: observation.failure_fingerprint,
      observed_at: nowIso,
      structural_outcome_only: true,
      customer_private_content_included: false,
      customer_identifiers_included: false,
      source_organization_id_persisted: false,
      source_party_id_persisted: false,
      source_conversation_id_persisted: false,
      raw_payload_persisted: false,
      raw_output_persisted: false,
      raw_reasoning_persisted: false,
      raw_failure_reason_persisted: false,
      training_ready: false,
      automatic_training_effect: "NONE",
      production_model_promotion_effect: "NONE",
      authorization_value: "none",
    },
    updated_at: nowIso,
  };

  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .insert(row)
    .select("id,subject,metadata,created_at")
    .single();
  if (written.error) throw written.error;

  return {
    contract: AVANTIQO_VERIFIED_OUTCOME_LEARNING_CONTRACT,
    written: Boolean(written.data?.id),
    outcome: observation.outcome,
    capability_key: observation.capability_key,
    governance: {
      structural_outcome_only: true,
      customer_private_content_promoted: false,
      customer_identifiers_persisted: false,
      raw_payload_persisted: false,
      raw_output_persisted: false,
      raw_reasoning_persisted: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
    },
  };
}

function summarizeCapability(rows) {
  const sorted = rows.slice().sort((left, right) =>
    String(right?.created_at || "").localeCompare(String(left?.created_at || "")),
  );
  const first = sorted[0] || {};
  const firstMetadata = object(first.metadata);
  const successRows = sorted.filter((row) => object(row.metadata).outcome === "VERIFIED_SUCCESS");
  const failureRows = sorted.filter((row) => object(row.metadata).outcome === "VERIFIED_FAILURE");
  const total = successRows.length + failureRows.length;
  const successRate = total ? successRows.length / total : 0;
  const smoothedSuccessRate = (successRows.length + 2) / (total + 4);
  const failureFingerprints = [...new Set(
    failureRows
      .map((row) => text(object(row.metadata).failure_fingerprint, 120))
      .filter(Boolean),
  )].slice(0, 12);
  const signals = [];
  if (total >= 3 && failureRows.length >= 2) signals.push("REPEATED_VERIFIED_FAILURES");
  if (total >= 5 && successRate < 0.8) signals.push("PRODUCT_OUTCOME_UNSTABLE");
  if (total >= 10 && successRate >= 0.98) signals.push("PRODUCT_OUTCOME_STRONG");
  if (failureFingerprints.length >= 2) signals.push("MULTIPLE_FAILURE_FAMILIES_OBSERVED");

  return {
    capability_key: text(firstMetadata.capability_key || first.subject, 300),
    capability_domain: text(firstMetadata.capability_domain, 120) || null,
    total_verified_outcomes: total,
    verified_success_count: successRows.length,
    verified_failure_count: failureRows.length,
    success_rate: Number(successRate.toFixed(4)),
    smoothed_success_rate: Number(smoothedSuccessRate.toFixed(4)),
    failure_family_count: failureFingerprints.length,
    failure_fingerprints: failureFingerprints,
    last_observed_at: firstMetadata.observed_at || first.created_at || null,
    last_success_at: successRows[0]?.metadata?.observed_at || successRows[0]?.created_at || null,
    last_failure_at: failureRows[0]?.metadata?.observed_at || failureRows[0]?.created_at || null,
    signals,
  };
}

export async function summarizeAvantiqoVerifiedExecutionOutcomes({
  lookbackDays = DEFAULT_LOOKBACK_DAYS,
  limit = DEFAULT_LIMIT,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      contract: AVANTIQO_VERIFIED_OUTCOME_LEARNING_CONTRACT,
      available: false,
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      capability_count: 0,
      summaries: [],
    };
  }

  const lookback = boundedInteger(lookbackDays, DEFAULT_LOOKBACK_DAYS, 1, MAX_LOOKBACK_DAYS);
  const rowLimit = boundedInteger(limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const cutoff = new Date(Date.now() - lookback * DAY_MS).toISOString();
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,subject,metadata,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", OUTCOME_SCOPE)
    .eq("active", true)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(rowLimit);
  if (result.error) throw result.error;

  const byCapability = new Map();
  for (const row of list(result.data)) {
    const metadata = object(row.metadata);
    if (metadata.structural_outcome_only !== true) continue;
    if (
      metadata.customer_private_content_included === true ||
      metadata.customer_identifiers_included === true ||
      metadata.raw_payload_persisted === true ||
      metadata.raw_output_persisted === true ||
      metadata.raw_reasoning_persisted === true
    ) {
      continue;
    }
    const key = text(metadata.capability_key || row.subject, 300);
    if (!key) continue;
    const rows = byCapability.get(key) || [];
    rows.push(row);
    byCapability.set(key, rows);
  }

  const summaries = [...byCapability.values()]
    .map(summarizeCapability)
    .sort((left, right) =>
      right.verified_failure_count - left.verified_failure_count ||
      right.total_verified_outcomes - left.total_verified_outcomes ||
      left.capability_key.localeCompare(right.capability_key),
    );

  return {
    contract: AVANTIQO_VERIFIED_OUTCOME_LEARNING_CONTRACT,
    available: true,
    lookback_days: lookback,
    observed_row_count: list(result.data).length,
    capability_count: summaries.length,
    summaries,
    governance: {
      structural_outcome_only: true,
      customer_private_content_reused: false,
      raw_reasoning_reused: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
    },
  };
}

export const AvantiqoVerifiedOutcomeLearningRuntime = Object.freeze({
  contract: AVANTIQO_VERIFIED_OUTCOME_LEARNING_CONTRACT,
  record: recordAvantiqoVerifiedExecutionOutcome,
  summarize: summarizeAvantiqoVerifiedExecutionOutcomes,
});
