import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_KNOWLEDGE_LIFECYCLE_CONTRACT =
  "AVANTIQO_KNOWLEDGE_LIFECYCLE_V1";

const MEMORY_TABLE = "intelligence_memories";
const KNOWLEDGE_SCOPE = "platform_knowledge";
const AGENDA_SCOPE = "platform_learning_agenda";
const EVENT_SCOPE = "platform_learning_knowledge_lifecycle_events";
const INTERNAL_SOURCE = "avantiqo_canonical_product_knowledge";
const MAX_KNOWLEDGE_ROWS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MUTABLE_VALIDITY_DAYS = 45;
const DEFAULT_STABLE_VALIDITY_DAYS = 180;
const DEFAULT_MUTABLE_REVIEW_DAYS = 21;
const DEFAULT_STABLE_REVIEW_DAYS = 90;
const AGING_FRACTION = 0.67;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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

function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 24000).toLowerCase()).join("|"))
    .digest("hex");
}

function normalizedClaim(value) {
  return text(value, 12000)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0e00-\u0e7f\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dateMs(value) {
  const parsed = Date.parse(text(value, 120));
  return Number.isFinite(parsed) ? parsed : null;
}

function mutableDomain(domain) {
  return new Set([
    "integrations",
    "intelligence",
    "compliance",
    "administration",
    "services",
    "tax",
    "legal",
  ]).has(text(domain, 120).toLowerCase());
}

function stabilityFor(row) {
  const metadata = object(row.metadata);
  const explicit = text(metadata.stability, 40).toLowerCase();
  if (explicit === "mutable" || explicit === "stable") return explicit;
  return mutableDomain(metadata.knowledge_domain) ? "mutable" : "stable";
}

function lifecycleWindow(row) {
  const metadata = object(row.metadata);
  const stability = stabilityFor(row);
  const defaultValidity = stability === "mutable"
    ? DEFAULT_MUTABLE_VALIDITY_DAYS
    : DEFAULT_STABLE_VALIDITY_DAYS;
  const defaultReview = stability === "mutable"
    ? DEFAULT_MUTABLE_REVIEW_DAYS
    : DEFAULT_STABLE_REVIEW_DAYS;
  const validityDays = boundedInteger(
    metadata.release_validity_days || metadata.validity_days || metadata.freshness_days,
    defaultValidity,
    1,
    3650,
  );
  const reviewDays = boundedInteger(
    metadata.review_interval_days,
    Math.min(defaultReview, validityDays),
    1,
    3650,
  );
  return { stability, validityDays, reviewDays };
}

function verifiedAtMs(row) {
  const metadata = object(row.metadata);
  return dateMs(
    metadata.verified_at ||
      metadata.released_at ||
      metadata.generated_at ||
      row.updated_at ||
      row.created_at,
  );
}

function expiryAtMs(row, verifiedMs, validityDays) {
  return dateMs(row.valid_until) ||
    (verifiedMs === null ? null : verifiedMs + validityDays * DAY_MS);
}

function nextReviewAtMs(row, verifiedMs, reviewDays) {
  const metadata = object(row.metadata);
  return dateMs(metadata.next_revalidation_at || metadata.next_review_at) ||
    (verifiedMs === null ? null : verifiedMs + reviewDays * DAY_MS);
}

function classifyLifecycle(row, nowMs = Date.now()) {
  const { stability, validityDays, reviewDays } = lifecycleWindow(row);
  const verifiedMs = verifiedAtMs(row);
  const expiryMs = expiryAtMs(row, verifiedMs, validityDays);
  const nextReviewMs = nextReviewAtMs(row, verifiedMs, reviewDays);
  if (expiryMs !== null && nowMs >= expiryMs) {
    return {
      status: "EXPIRED_RELEARNING_REQUIRED",
      stability,
      validity_days: validityDays,
      review_interval_days: reviewDays,
      verified_at: verifiedMs === null ? null : new Date(verifiedMs).toISOString(),
      expires_at: new Date(expiryMs).toISOString(),
      next_review_at: nextReviewMs === null ? null : new Date(nextReviewMs).toISOString(),
      lifecycle_progress: 1,
    };
  }
  if (nextReviewMs !== null && nowMs >= nextReviewMs) {
    return {
      status: "REVALIDATION_DUE",
      stability,
      validity_days: validityDays,
      review_interval_days: reviewDays,
      verified_at: verifiedMs === null ? null : new Date(verifiedMs).toISOString(),
      expires_at: expiryMs === null ? null : new Date(expiryMs).toISOString(),
      next_review_at: new Date(nextReviewMs).toISOString(),
      lifecycle_progress: verifiedMs !== null && expiryMs !== null && expiryMs > verifiedMs
        ? Math.min(1, Math.max(0, (nowMs - verifiedMs) / (expiryMs - verifiedMs)))
        : null,
    };
  }
  const progress = verifiedMs !== null && expiryMs !== null && expiryMs > verifiedMs
    ? Math.min(1, Math.max(0, (nowMs - verifiedMs) / (expiryMs - verifiedMs)))
    : 0;
  return {
    status: progress >= AGING_FRACTION ? "AGING" : "FRESH",
    stability,
    validity_days: validityDays,
    review_interval_days: reviewDays,
    verified_at: verifiedMs === null ? null : new Date(verifiedMs).toISOString(),
    expires_at: expiryMs === null ? null : new Date(expiryMs).toISOString(),
    next_review_at: nextReviewMs === null ? null : new Date(nextReviewMs).toISOString(),
    lifecycle_progress: Number(progress.toFixed(4)),
  };
}

function exactClaimKey(row) {
  const metadata = object(row.metadata);
  const claim = normalizedClaim(row.content);
  if (!claim) return null;
  return digest(
    "exact-claim",
    text(metadata.knowledge_domain, 120),
    text(metadata.jurisdiction, 120),
    claim,
  );
}

function rowRecency(row) {
  return verifiedAtMs(row) || dateMs(row.updated_at) || dateMs(row.created_at) || 0;
}

function exactDuplicateLosers(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = exactClaimKey(row);
    if (!key) continue;
    const bucket = groups.get(key) || [];
    bucket.push(row);
    groups.set(key, bucket);
  }
  const losers = [];
  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue;
    const ordered = bucket.slice().sort((left, right) => {
      const recency = rowRecency(right) - rowRecency(left);
      if (recency !== 0) return recency;
      const confidence = Number(right.confidence || 0) - Number(left.confidence || 0);
      if (confidence !== 0) return confidence;
      return String(right.id || "").localeCompare(String(left.id || ""));
    });
    const winner = ordered[0];
    for (const loser of ordered.slice(1)) losers.push({ loser, winner });
  }
  return losers;
}

function refreshGeneration(row) {
  const metadata = object(row.metadata);
  return Math.max(1, Number.parseInt(metadata.lifecycle_generation, 10) || 1);
}

function refreshAgendaRow({ organizationId, row, lifecycle, reason, nowIso }) {
  const metadata = object(row.metadata);
  const claimFingerprint = exactClaimKey(row) || digest(row.memory_key, row.content);
  const parentTopic = text(metadata.topic_key, 240) || null;
  const generation = refreshGeneration(row) + 1;
  const deepRefresh = generation >= 3 || lifecycle.stability === "mutable";
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AGENDA_SCOPE,
    memory_key: `knowledge-lifecycle-refresh:${claimFingerprint.slice(0, 40)}`,
    memory_type: "goal",
    subject: `knowledge-lifecycle-refresh-${claimFingerprint.slice(0, 20)}`,
    content: [
      `Revalidate and relearn this previously reusable platform knowledge claim: ${text(row.content, 5000)}`,
      `Lifecycle trigger: ${reason}.`,
      "Find current authoritative evidence, contradictions, changed standards, boundary conditions and failed replications.",
      "Do not restore or promote the old claim automatically. Produce fresh evidence for the normal mechanism, experiment, benchmark and explicit-release pipeline.",
    ].join(" "),
    importance: reason === "EXPIRED_RELEARNING_REQUIRED" ? 0.98 : 0.9,
    confidence: 1,
    source: "knowledge_lifecycle_curriculum_regeneration",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_KNOWLEDGE_LIFECYCLE_CONTRACT,
      continuous_learning: true,
      self_directed_learning: true,
      knowledge_lifecycle_refresh: true,
      topic_key: `lifecycle-${claimFingerprint.slice(0, 20)}`,
      parent_topic_key: parentTopic,
      knowledge_domain: text(metadata.knowledge_domain, 120) || null,
      jurisdiction: text(metadata.jurisdiction, 120) || null,
      stability: lifecycle.stability,
      research_mode: deepRefresh ? "mechanism" : "evidence",
      curriculum_depth: Math.min(12, generation),
      refresh_generation: generation,
      lifecycle_trigger: reason,
      source_knowledge_memory_key: row.memory_key,
      source_claim_fingerprint: claimFingerprint,
      status: "READY",
      next_research_at: nowIso,
      freshness_days: lifecycle.stability === "mutable" ? 30 : 90,
      review_interval_days: lifecycle.stability === "mutable" ? 21 : 90,
      contradiction_search_required: true,
      changed_standard_search_required: true,
      boundary_condition_search_required: true,
      failed_replication_search_required: deepRefresh,
      automatic_restore_allowed: false,
      automatic_knowledge_promotion: false,
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
      generated_at: nowIso,
    },
    updated_at: nowIso,
  };
}

function lifecycleEventRow({ organizationId, row, event, reason, nowIso, supersededBy = null }) {
  const metadata = object(row.metadata);
  const eventFingerprint = digest(
    "knowledge-lifecycle-event",
    row.memory_key,
    event,
    reason,
    text(metadata.verified_at || row.updated_at, 120),
  );
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: EVENT_SCOPE,
    memory_key: `knowledge-lifecycle-event:${eventFingerprint.slice(0, 40)}`,
    memory_type: event.includes("RETIRED") || event.includes("SUPERSEDED") ? "completed_step" : "evidence",
    subject: row.subject,
    content: `Knowledge lifecycle event ${event}: ${reason}.`,
    importance: 0.76,
    confidence: 1,
    source: "knowledge_lifecycle_governance",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_KNOWLEDGE_LIFECYCLE_CONTRACT,
      event,
      reason,
      source_knowledge_memory_key: row.memory_key,
      source_knowledge_id: row.id || null,
      superseded_by_knowledge_id: supersededBy,
      topic_key: text(metadata.topic_key, 240) || null,
      knowledge_domain: text(metadata.knowledge_domain, 120) || null,
      observed_at: nowIso,
      customer_private_content_included: false,
      source_customer_identifiers_persisted: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
    },
    updated_at: nowIso,
  };
}

async function loadKnowledge(organizationId) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,memory_type,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", KNOWLEDGE_SCOPE)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(MAX_KNOWLEDGE_ROWS);
  if (result.error) throw result.error;
  return list(result.data).filter((row) => row.source !== INTERNAL_SOURCE);
}

async function upsertRows(rows) {
  if (!rows.length) return 0;
  let count = 0;
  for (let index = 0; index < rows.length; index += 150) {
    const result = await supabaseAdmin
      .from(MEMORY_TABLE)
      .upsert(rows.slice(index, index + 150), {
        onConflict: "organization_id,memory_scope,memory_key",
      })
      .select("id");
    if (result.error) throw result.error;
    count += list(result.data).length;
  }
  return count;
}

async function retireExpired({ organizationId, row, lifecycle, nowIso }) {
  const metadata = object(row.metadata);
  const nextMetadata = {
    ...metadata,
    lifecycle_contract: AVANTIQO_KNOWLEDGE_LIFECYCLE_CONTRACT,
    lifecycle_status: "RETIRED_EXPIRED",
    lifecycle_generation: refreshGeneration(row),
    reusable_platform_knowledge: false,
    knowledge_router_reuse_allowed: false,
    retired_at: nowIso,
    retirement_reason: "KNOWLEDGE_VALIDITY_EXPIRED",
    automatic_restore_allowed: false,
    automatic_knowledge_promotion: false,
    last_lifecycle_classified_at: nowIso,
    ...lifecycle,
  };
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({
      active: false,
      forgotten_at: nowIso,
      metadata: nextMetadata,
      updated_at: nowIso,
    })
    .eq("organization_id", organizationId)
    .eq("id", row.id)
    .eq("updated_at", row.updated_at)
    .select("id")
    .maybeSingle();
  if (result.error) throw result.error;
  return Boolean(result.data?.id);
}

async function retireExactDuplicate({ organizationId, loser, winner, nowIso }) {
  const metadata = object(loser.metadata);
  const nextMetadata = {
    ...metadata,
    lifecycle_contract: AVANTIQO_KNOWLEDGE_LIFECYCLE_CONTRACT,
    lifecycle_status: "RETIRED_EXACT_DUPLICATE",
    reusable_platform_knowledge: false,
    knowledge_router_reuse_allowed: false,
    retired_at: nowIso,
    retirement_reason: "EXACT_NORMALIZED_CLAIM_DUPLICATE",
    exact_duplicate_only: true,
    semantic_deletion_used: false,
    automatic_restore_allowed: false,
    automatic_knowledge_promotion: false,
    last_lifecycle_classified_at: nowIso,
  };
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({
      active: false,
      superseded_by: winner.id,
      superseded_at: nowIso,
      metadata: nextMetadata,
      updated_at: nowIso,
    })
    .eq("organization_id", organizationId)
    .eq("id", loser.id)
    .eq("updated_at", loser.updated_at)
    .select("id")
    .maybeSingle();
  if (result.error) throw result.error;
  return Boolean(result.data?.id);
}

async function annotateLifecycle({ organizationId, row, lifecycle, nowIso }) {
  const metadata = object(row.metadata);
  if (text(metadata.lifecycle_status, 120) === lifecycle.status) return false;
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({
      metadata: {
        ...metadata,
        lifecycle_contract: AVANTIQO_KNOWLEDGE_LIFECYCLE_CONTRACT,
        lifecycle_status: lifecycle.status,
        last_lifecycle_classified_at: nowIso,
        automatic_restore_allowed: false,
        automatic_knowledge_promotion: false,
        ...lifecycle,
      },
      updated_at: nowIso,
    })
    .eq("organization_id", organizationId)
    .eq("id", row.id)
    .eq("updated_at", row.updated_at)
    .select("id")
    .maybeSingle();
  if (result.error) throw result.error;
  return Boolean(result.data?.id);
}

export async function reconcileAvantiqoKnowledgeLifecycle({ persist = true } = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_KNOWLEDGE_LIFECYCLE_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      learned_knowledge_count: 0,
    };
  }

  const rows = await loadKnowledge(organizationId);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const duplicatePairs = exactDuplicateLosers(rows);
  const duplicateIds = new Set(duplicatePairs.map((entry) => entry.loser.id));
  const classifications = rows
    .filter((row) => !duplicateIds.has(row.id))
    .map((row) => ({ row, lifecycle: classifyLifecycle(row, nowMs) }));

  const fresh = classifications.filter((entry) => entry.lifecycle.status === "FRESH");
  const aging = classifications.filter((entry) => entry.lifecycle.status === "AGING");
  const due = classifications.filter((entry) => entry.lifecycle.status === "REVALIDATION_DUE");
  const expired = classifications.filter((entry) => entry.lifecycle.status === "EXPIRED_RELEARNING_REQUIRED");

  let duplicateRetiredCount = 0;
  let expiredRetiredCount = 0;
  let annotationWriteCount = 0;
  const agendaRows = [];
  const eventRows = [];

  if (persist) {
    for (const pair of duplicatePairs) {
      const retired = await retireExactDuplicate({
        organizationId,
        loser: pair.loser,
        winner: pair.winner,
        nowIso,
      });
      if (retired) {
        duplicateRetiredCount += 1;
        eventRows.push(lifecycleEventRow({
          organizationId,
          row: pair.loser,
          event: "EXACT_DUPLICATE_SUPERSEDED",
          reason: "EXACT_NORMALIZED_CLAIM_DUPLICATE",
          supersededBy: pair.winner.id,
          nowIso,
        }));
      }
    }

    for (const entry of [...fresh, ...aging, ...due]) {
      if (await annotateLifecycle({
        organizationId,
        row: entry.row,
        lifecycle: entry.lifecycle,
        nowIso,
      })) annotationWriteCount += 1;
    }

    for (const entry of expired) {
      const retired = await retireExpired({
        organizationId,
        row: entry.row,
        lifecycle: entry.lifecycle,
        nowIso,
      });
      if (retired) {
        expiredRetiredCount += 1;
        agendaRows.push(refreshAgendaRow({
          organizationId,
          row: entry.row,
          lifecycle: entry.lifecycle,
          reason: "EXPIRED_RELEARNING_REQUIRED",
          nowIso,
        }));
        eventRows.push(lifecycleEventRow({
          organizationId,
          row: entry.row,
          event: "EXPIRED_RETIRED",
          reason: "KNOWLEDGE_VALIDITY_EXPIRED",
          nowIso,
        }));
      }
    }

    for (const entry of due) {
      agendaRows.push(refreshAgendaRow({
        organizationId,
        row: entry.row,
        lifecycle: entry.lifecycle,
        reason: "REVALIDATION_DUE",
        nowIso,
      }));
    }
  }

  const [agendaWriteCount, eventWriteCount] = persist
    ? await Promise.all([upsertRows(agendaRows), upsertRows(eventRows)])
    : [0, 0];

  return {
    success: true,
    contract: AVANTIQO_KNOWLEDGE_LIFECYCLE_CONTRACT,
    status: expired.length || due.length
      ? "KNOWLEDGE_RELEARNING_REQUIRED"
      : aging.length
        ? "KNOWLEDGE_AGING_MONITORED"
        : "KNOWLEDGE_LIFECYCLE_HEALTHY",
    learned_knowledge_count: rows.length,
    fresh_count: fresh.length,
    aging_count: aging.length,
    revalidation_due_count: due.length,
    expired_count: expired.length,
    exact_duplicate_count: duplicatePairs.length,
    expired_retired_count: expiredRetiredCount,
    exact_duplicate_retired_count: duplicateRetiredCount,
    lifecycle_annotation_write_count: annotationWriteCount,
    relearning_agenda_count: agendaRows.length,
    relearning_agenda_write_count: agendaWriteCount,
    lifecycle_event_write_count: eventWriteCount,
    lifecycle_policy: {
      canonical_internal_product_knowledge_excluded: true,
      exact_duplicate_supersession_allowed: true,
      semantic_similarity_deletion_allowed: false,
      expired_knowledge_removed_from_router_visibility: true,
      aging_knowledge_remains_visible_until_due_or_expired: true,
      revalidation_due_enqueues_learning: true,
      expired_knowledge_enqueues_learning: true,
      repeated_refresh_escalates_to_mechanism_research: true,
      relearning_bypasses_epistemic_pipeline: false,
      automatic_restore_allowed: false,
      automatic_knowledge_promotion: false,
    },
    governance: {
      provider_free: true,
      web_research_executed_here: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      customer_private_content_promoted: false,
      raw_reasoning_persisted: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoKnowledgeLifecycleRuntime = Object.freeze({
  contract: AVANTIQO_KNOWLEDGE_LIFECYCLE_CONTRACT,
  reconcile: reconcileAvantiqoKnowledgeLifecycle,
});
