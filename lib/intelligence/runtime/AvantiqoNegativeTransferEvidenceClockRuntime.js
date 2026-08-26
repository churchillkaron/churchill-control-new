import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT,
  AVANTIQO_NEGATIVE_TRANSFER_MEMORY_SCOPE,
} from "@/lib/intelligence/runtime/AvantiqoLearningTransferValidationRuntime";

export const AVANTIQO_NEGATIVE_TRANSFER_EVIDENCE_CLOCK_CONTRACT =
  "AVANTIQO_NEGATIVE_TRANSFER_EVIDENCE_CLOCK_V1";

const MEMORY_TABLE = "intelligence_memories";
const RESULT_SCOPE = "platform_learning_transfer_experiment_results";
const REVIEW_DAYS = 30;
const VALIDITY_DAYS = 180;
const MAX_ROWS = 2000;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function plusDays(value, days) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function mechanismKey(row) {
  const metadata = object(row.metadata);
  const source = text(metadata.source_topic_key, 240).toLowerCase();
  const target = text(metadata.target_topic_key, 240).toLowerCase();
  const mechanism = text(metadata.mechanism_fingerprint, 128).toLowerCase();
  return source && target && mechanism ? `${source}|${target}|${mechanism}` : "";
}

function latestExecutedAt(rows) {
  let latest = Number.NaN;
  for (const row of rows) {
    const metadata = object(row.metadata);
    const candidate = Date.parse(text(metadata.executed_at, 120));
    if (Number.isFinite(candidate) && (!Number.isFinite(latest) || candidate > latest)) {
      latest = candidate;
    }
  }
  return Number.isFinite(latest) ? new Date(latest).toISOString() : null;
}

async function loadScope(organizationId, scope) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,forgotten_at,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", scope)
    .eq("active", true)
    .limit(MAX_ROWS);
  if (result.error) throw result.error;
  return list(result.data);
}

export async function reconcileAvantiqoNegativeTransferEvidenceClock({ persist = true } = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_NEGATIVE_TRANSFER_EVIDENCE_CLOCK_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      checked_count: 0,
    };
  }

  const [negativeRows, resultRows] = await Promise.all([
    loadScope(organizationId, AVANTIQO_NEGATIVE_TRANSFER_MEMORY_SCOPE),
    loadScope(organizationId, RESULT_SCOPE),
  ]);
  const resultsByMechanism = new Map();
  for (const row of resultRows) {
    const metadata = object(row.metadata);
    if (
      text(metadata.contract, 160) !== AVANTIQO_LEARNING_TRANSFER_VALIDATION_CONTRACT ||
      metadata.governed_experiment_result !== true ||
      metadata.customer_private_content_used !== false ||
      metadata.customer_identifiers_used !== false
    ) continue;
    const key = mechanismKey(row);
    if (!key) continue;
    const bucket = resultsByMechanism.get(key) || [];
    bucket.push(row);
    resultsByMechanism.set(key, bucket);
  }

  const nowIso = new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  let anchoredCount = 0;
  let expiredCount = 0;
  let missingEvidenceCount = 0;

  for (const row of negativeRows) {
    const metadata = object(row.metadata);
    const key = mechanismKey(row);
    const evidenceRows = key ? resultsByMechanism.get(key) || [] : [];
    const evidenceAt = latestExecutedAt(evidenceRows);
    if (!evidenceAt) {
      missingEvidenceCount += 1;
      continue;
    }
    const reviewAfter = plusDays(evidenceAt, REVIEW_DAYS);
    const expiresAt = plusDays(evidenceAt, VALIDITY_DAYS);
    const expired = Date.parse(expiresAt) <= nowMs;
    if (persist) {
      const result = await supabaseAdmin
        .from(MEMORY_TABLE)
        .update({
          active: !expired,
          valid_until: expiresAt,
          forgotten_at: expired ? nowIso : row.forgotten_at || null,
          updated_at: nowIso,
          metadata: {
            ...metadata,
            status: expired
              ? "NEGATIVE_TRANSFER_MEMORY_EXPIRED"
              : "NEGATIVE_TRANSFER_MEMORY_ACTIVE",
            negative_transfer_exclusion_active: !expired,
            review_required: true,
            review_after: reviewAfter,
            expires_at: expiresAt,
            latest_refutation_evidence_at: evidenceAt,
            expiry_anchored_to_latest_evidence: true,
            reconciliation_time_cannot_extend_expiry: true,
            automatic_restoration_performed: false,
            evidence_clock_reconciled_at: nowIso,
          },
        })
        .eq("id", row.id)
        .select("id")
        .single();
      if (result.error) throw result.error;
    }
    anchoredCount += 1;
    if (expired) expiredCount += 1;
  }

  return {
    success: true,
    contract: AVANTIQO_NEGATIVE_TRANSFER_EVIDENCE_CLOCK_CONTRACT,
    status: negativeRows.length
      ? "NEGATIVE_TRANSFER_EVIDENCE_CLOCK_RECONCILED"
      : "NO_ACTIVE_NEGATIVE_TRANSFER_MEMORY",
    checked_count: negativeRows.length,
    evidence_anchored_count: anchoredCount,
    expired_count: expiredCount,
    missing_evidence_count: missingEvidenceCount,
    policy: {
      review_days: REVIEW_DAYS,
      validity_days: VALIDITY_DAYS,
      expiry_anchored_to_latest_refutation_evidence: true,
      reconciliation_time_cannot_extend_expiry: true,
      exact_mechanism_scope_only: true,
      pair_wide_block: false,
    },
    governance: {
      provider_free: true,
      experiment_execution_performed: false,
      runpod_job_submitted: false,
      platform_knowledge_written: false,
      automatic_knowledge_promotion: false,
      automatic_training_started: false,
      automatic_restoration_performed: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoNegativeTransferEvidenceClockRuntime = Object.freeze({
  contract: AVANTIQO_NEGATIVE_TRANSFER_EVIDENCE_CLOCK_CONTRACT,
  reconcile: reconcileAvantiqoNegativeTransferEvidenceClock,
});
