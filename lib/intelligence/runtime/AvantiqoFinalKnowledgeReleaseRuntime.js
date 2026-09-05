import { createHash, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { inspectAvantiqoEvidenceGraph } from "@/lib/intelligence/runtime/AvantiqoEvidenceGraphRuntime";
import {
  AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
  AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT,
  createAvantiqoFinalPromotionCandidateAuthenticityVerifier,
  verifyAvantiqoFinalPromotionCandidateClaimBinding,
} from "./AvantiqoFinalPromotionCandidateAuthenticityRuntime.js";
import {
  AVANTIQO_RELEASED_KNOWLEDGE_AUTHENTICITY_CONTRACT,
  createAvantiqoReleasedKnowledgeAuthenticityVerifier,
  sealAvantiqoReleasedKnowledgeAuthenticity,
} from "./AvantiqoReleasedKnowledgeAuthenticityRuntime.js";

export const AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT =
  "AVANTIQO_FINAL_KNOWLEDGE_RELEASE_V1";

const MEMORY_TABLE = "intelligence_memories";
const FINAL_CANDIDATE_SCOPE = "platform_learning_knowledge_final_promotion_candidates";
const PROVISIONAL_SCOPE = "platform_provisional_knowledge";
const KNOWLEDGE_SCOPE = "platform_knowledge";
const EVIDENCE_SCOPE = "platform_evidence_graph";
const RELEASE_EVENT_SCOPE = "platform_learning_knowledge_release_events";
const AGENDA_SCOPE = "platform_learning_agenda";
const RELEASE_SOURCE = "avantiqo_explicit_final_knowledge_release";
const RELEASE_APPROVAL_ENV = "AVANTIQO_KNOWLEDGE_FINAL_RELEASE_APPROVED";
const MAX_ROWS = 500;
const MAX_EVIDENCE_ROWS = 300;
const MIN_BENCHMARK_PASS_RATE = 0.97;
const MIN_BENCHMARK_QUALITY_DELTA = 0.01;
const DAY_MS = 24 * 60 * 60 * 1000;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function bounded(value, fallback = 0, minimum = 0, maximum = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value, 20).toLowerCase());
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 24000).toLowerCase()).join("|"))
    .digest("hex");
}

function fingerprint(value, code) {
  const normalized = text(value, 160).toLowerCase();
  if (!/^[a-f0-9]{16,128}$/.test(normalized)) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_${code}_INVALID`);
  }
  return normalized;
}

function tokens(value) {
  return [...new Set(
    text(value, 16000)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\u0e00-\u0e7f\s_-]/g, " ")
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 2),
  )].slice(0, 120);
}

function overlap(left, right) {
  const leftTokens = tokens(left);
  if (!leftTokens.length) return 0;
  const rightTokens = new Set(tokens(right));
  let hits = 0;
  for (const token of leftTokens.slice(0, 48)) {
    if (rightTokens.has(token)) hits += 1;
  }
  return hits / Math.min(48, leftTokens.length);
}

function sourceHost(url) {
  try {
    return new URL(text(url, 2000)).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function sourceSummary(value = {}) {
  const source = object(value);
  const url = text(source.url, 2000);
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    id: text(source.id, 160) || null,
    url,
    title: text(source.title, 500) || null,
    publisher: text(source.publisher, 300) || null,
    source_type: text(source.source_type || source.sourceType, 120) || null,
    published_at: text(source.published_at || source.publishedAt, 120) || null,
    retrieved_at: text(source.retrieved_at || source.retrievedAt, 120) || null,
    official: source.official === true,
    primary: source.primary === true,
  };
}

function validEvidenceRow(row, nowMs = Date.now()) {
  if (row?.active !== true) return false;
  const validUntil = Date.parse(text(row.valid_until, 120));
  return !Number.isFinite(validUntil) || validUntil > nowMs;
}

function candidateBenchmarkStillEligible(candidate) {
  const metadata = object(candidate.metadata);
  const candidateMetrics = object(metadata.candidate);
  const evidence = object(metadata.counterfactual_evidence);
  return Boolean(
    text(metadata.status, 120) === "FINAL_KNOWLEDGE_RELEASE_REVIEW_PENDING" &&
      metadata.exact_claim_release_requires_separate_runtime === true &&
      metadata.explicit_final_knowledge_release_required === true &&
      metadata.production_knowledge_release_authorized === false &&
      metadata.reusable_platform_knowledge === false &&
      metadata.platform_knowledge_written === false &&
      metadata.exact_provisional_claim_bound === true &&
      metadata.final_promotion_candidate_authenticity_required === true &&
      Number(metadata.regression_count || 0) === 0 &&
      Number(metadata.quality_delta || 0) >= MIN_BENCHMARK_QUALITY_DELTA &&
      Number(metadata.hallucination_delta || 0) <= 0 &&
      Number(candidateMetrics.pass_rate || 0) >= MIN_BENCHMARK_PASS_RATE &&
      candidateMetrics.governance_passed === true &&
      candidateMetrics.privacy_passed === true &&
      candidateMetrics.tool_use_passed === true &&
      candidateMetrics.authorization_passed === true &&
      candidateMetrics.uncertainty_calibration_passed === true &&
      candidateMetrics.leakage_detected === false &&
      Number(candidateMetrics.critical_case_failure_count || 0) === 0 &&
      evidence.same_cases_both_arms === true &&
      evidence.blind_pairing === true &&
      evidence.independent_evaluator === true &&
      evidence.candidate_did_not_grade_itself === true &&
      evidence.exact_provisional_claim_isolated === true &&
      evidence.customer_private_cases_used === false &&
      evidence.customer_identifiers_used === false
  );
}

function provisionalStillEligible(provisional, hypothesisFingerprint) {
  const metadata = object(provisional?.metadata);
  return Boolean(
    provisional?.active === true &&
      text(metadata.hypothesis_fingerprint, 128) === hypothesisFingerprint &&
      text(metadata.status, 120) === "PROVISIONAL_SHADOW_ONLY" &&
      text(metadata.epistemic_state, 120) === "PROVISIONAL_NOT_CANONICAL" &&
      metadata.reusable_platform_knowledge === false &&
      metadata.knowledge_router_reuse_allowed === false &&
      metadata.explicit_final_promotion_required === true &&
      metadata.rollback_on_conflict === true &&
      metadata.automatic_knowledge_promotion === false &&
      text(provisional.content, 6000)
  );
}

async function loadReleaseInputs(organizationId, hypothesisFingerprint) {
  const [candidate, provisional, evidenceRows, existingRelease] = await Promise.all([
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,organization_id,party_id,entity_id,conversation_id,source_turn_id,memory_scope,memory_key,memory_type,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", FINAL_CANDIDATE_SCOPE)
      .eq("metadata->>hypothesis_fingerprint", hypothesisFingerprint)
      .eq("active", true)
      .maybeSingle(),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,organization_id,party_id,entity_id,conversation_id,source_turn_id,memory_scope,memory_key,memory_type,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", PROVISIONAL_SCOPE)
      .eq("metadata->>hypothesis_fingerprint", hypothesisFingerprint)
      .eq("active", true)
      .maybeSingle(),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,content,confidence,active,valid_until,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", EVIDENCE_SCOPE)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(MAX_EVIDENCE_ROWS),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,organization_id,party_id,entity_id,conversation_id,source_turn_id,memory_scope,memory_key,memory_type,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", KNOWLEDGE_SCOPE)
      .eq("source", RELEASE_SOURCE)
      .eq("metadata->>hypothesis_fingerprint", hypothesisFingerprint)
      .eq("active", true)
      .maybeSingle(),
  ]);
  for (const result of [candidate, provisional, evidenceRows, existingRelease]) {
    if (result.error) throw result.error;
  }
  return {
    candidate: candidate.data || null,
    provisional: provisional.data || null,
    evidenceRows: list(evidenceRows.data).filter((row) => validEvidenceRow(row)),
    existingRelease: existingRelease.data || null,
  };
}

function supportingEvidence(claim, rows) {
  const candidates = [];
  for (const row of rows) {
    const metadata = object(row.metadata);
    for (const sourceClaim of list(metadata.claims)) {
      if (text(sourceClaim?.status, 40).toUpperCase() !== "SUPPORTED") continue;
      if (Number(sourceClaim?.contradict_count || 0) > 0) continue;
      const claimText = text(sourceClaim?.claim, 4000);
      if (!claimText) continue;
      const relevance = overlap(claim, claimText);
      if (relevance < 0.18) continue;
      const sources = list(sourceClaim?.support_sources).map(sourceSummary).filter(Boolean);
      const hosts = new Set(sources.map((source) => sourceHost(source.url)).filter(Boolean));
      const officialPrimary = sources.some((source) => source.official && source.primary);
      if (sources.length < 2 && !officialPrimary) continue;
      candidates.push({
        row,
        metadata,
        sourceClaim,
        claimText,
        relevance,
        sources,
        independentHostCount: hosts.size,
        officialPrimary,
      });
    }
  }
  candidates.sort((left, right) => {
    const leftScore = left.relevance + bounded(left.sourceClaim.confidence, 0) * 0.25 +
      Math.min(0.2, left.independentHostCount * 0.04) + (left.officialPrimary ? 0.08 : 0);
    const rightScore = right.relevance + bounded(right.sourceClaim.confidence, 0) * 0.25 +
      Math.min(0.2, right.independentHostCount * 0.04) + (right.officialPrimary ? 0.08 : 0);
    return rightScore - leftScore;
  });
  const best = candidates[0] || null;
  if (!best) return null;
  return {
    evidence_graph_memory_key: best.row.memory_key,
    evidence_graph_topic_key: text(best.metadata.topic_key, 240) || null,
    evidence_graph_generated_at: text(best.metadata.generated_at || best.row.updated_at, 120) || null,
    evidence_graph_status: text(best.metadata.graph_status, 80) || null,
    knowledge_domain: text(best.metadata.domain, 120) || null,
    jurisdiction: text(best.metadata.jurisdiction, 120) || null,
    stability: text(best.metadata.stability, 40).toLowerCase() === "mutable" ? "mutable" : "stable",
    supporting_claim: best.claimText,
    supporting_claim_relevance: Number(best.relevance.toFixed(4)),
    supporting_claim_confidence: bounded(best.sourceClaim.confidence, 0),
    source_count: best.sources.length,
    independent_source_host_count: best.independentHostCount,
    official_primary_support: best.officialPrimary,
    sources: best.sources,
  };
}

function knowledgeValidityDays(stability) {
  return stability === "mutable" ? 30 : 90;
}

function knowledgeRow({
  organizationId,
  candidate,
  provisional,
  support,
  approvalReason,
  releaseNote,
  nowIso,
}) {
  const candidateMetadata = object(candidate.metadata);
  const provisionalMetadata = object(provisional.metadata);
  const hypothesisFingerprint = text(candidateMetadata.hypothesis_fingerprint, 128);
  const topicKey = text(
    provisionalMetadata.root_topic_key ||
      candidateMetadata.root_topic_key ||
      support.evidence_graph_topic_key ||
      provisional.subject,
    240,
  );
  const releaseId = digest(
    "final-knowledge-release",
    hypothesisFingerprint,
    candidateMetadata.evaluation_fingerprint,
    provisional.content,
  );
  const validityDays = knowledgeValidityDays(support.stability);
  const validUntil = new Date(Date.now() + validityDays * DAY_MS).toISOString();
  const nextRevalidationAt = new Date(Date.now() + Math.max(1, Math.floor(validityDays / 3)) * DAY_MS)
    .toISOString();
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: KNOWLEDGE_SCOPE,
    memory_key: `released-knowledge:${hypothesisFingerprint.slice(0, 40)}`,
    memory_type: "fact",
    subject: `knowledge:${topicKey}`,
    content: text(provisional.content, 6000),
    importance: 0.96,
    confidence: Math.min(0.95, Math.max(0.78, support.supporting_claim_confidence)),
    source: RELEASE_SOURCE,
    active: true,
    valid_until: validUntil,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT,
      release_id: releaseId,
      release_status: "RELEASED_MONITORED",
      hypothesis_fingerprint: hypothesisFingerprint,
      synthesis_fingerprint: provisionalMetadata.synthesis_fingerprint || null,
      benchmark_plan_fingerprint: candidateMetadata.benchmark_plan_fingerprint || null,
      evaluation_fingerprint: candidateMetadata.evaluation_fingerprint || null,
      topic_key: topicKey,
      knowledge_domain: support.knowledge_domain,
      jurisdiction: support.jurisdiction,
      stability: support.stability,
      verified_at: nowIso,
      released_at: nowIso,
      release_validity_days: validityDays,
      next_revalidation_at: nextRevalidationAt,
      explicit_final_release_approved: true,
      released_knowledge_authenticity_required: true,
      released_knowledge_authenticity_contract:
        AVANTIQO_RELEASED_KNOWLEDGE_AUTHENTICITY_CONTRACT,
      unsigned_legacy_release_compatibility_allowed: false,
      database_only_released_claim_mutation_allowed: false,
      approval_reason: text(approvalReason, 800),
      release_note: text(releaseNote, 1200) || null,
      final_promotion_candidate_authenticity_contract:
        AVANTIQO_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_CONTRACT,
      final_promotion_candidate_authenticity_verified: true,
      final_promotion_candidate_authenticity_key_id:
        text(candidateMetadata.final_promotion_candidate_authenticity_key_id, 80) || null,
      provisional_claim_binding_contract: AVANTIQO_FINAL_PROMOTION_CLAIM_BINDING_CONTRACT,
      provisional_claim_binding_verified: true,
      provisional_claim_memory_key: candidateMetadata.provisional_claim_memory_key || null,
      provisional_claim_digest: candidateMetadata.provisional_claim_digest || null,
      benchmark_pass_rate: Number(object(candidateMetadata.candidate).pass_rate || 0),
      benchmark_quality_delta: Number(candidateMetadata.quality_delta || 0),
      benchmark_regression_count: Number(candidateMetadata.regression_count || 0),
      benchmark_hallucination_delta: Number(candidateMetadata.hallucination_delta || 0),
      evidence_graph_contract: "AVANTIQO_EVIDENCE_GRAPH_V1",
      evidence_graph_memory_key: support.evidence_graph_memory_key,
      evidence_graph_topic_key: support.evidence_graph_topic_key,
      evidence_graph_generated_at: support.evidence_graph_generated_at,
      evidence_graph_status: support.evidence_graph_status,
      supporting_claim_relevance: support.supporting_claim_relevance,
      supporting_claim_confidence: support.supporting_claim_confidence,
      source_count: support.source_count,
      independent_source_host_count: support.independent_source_host_count,
      official_primary_support: support.official_primary_support,
      sources: support.sources,
      evidence_status: "SUPPORTED",
      evidence_comparison_contract: "AVANTIQO_EVIDENCE_GRAPH_V1",
      reusable_platform_knowledge: true,
      knowledge_router_reuse_allowed: true,
      explicit_release_required: true,
      automatic_knowledge_promotion: false,
      post_release_revalidation_required: true,
      rollback_mode: "FAIL_CLOSED_QUARANTINE",
      automatic_unquarantine_allowed: false,
      customer_private_content_included: false,
      source_customer_identifiers_persisted: false,
      raw_reasoning_persisted: false,
      automatic_training_effect: "NONE",
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      authorization_value: "none",
    },
    updated_at: nowIso,
  };
}

function releaseEventRow({ organizationId, releaseRow, event, reason, nowIso }) {
  const metadata = object(releaseRow.metadata);
  const eventId = digest(
    "knowledge-release-event",
    releaseRow.memory_key,
    event,
    reason,
    nowIso.slice(0, 13),
  );
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: RELEASE_EVENT_SCOPE,
    memory_key: `knowledge-release-event:${eventId.slice(0, 40)}`,
    memory_type: event === "QUARANTINED" ? "blocker" : "completed_step",
    subject: releaseRow.subject,
    content: `Knowledge release event ${event}: ${text(reason, 1000)}.`,
    importance: event === "QUARANTINED" ? 0.98 : 0.9,
    confidence: 1,
    source: "final_knowledge_release_governance",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT,
      event,
      release_memory_key: releaseRow.memory_key,
      release_id: metadata.release_id || null,
      hypothesis_fingerprint: metadata.hypothesis_fingerprint || null,
      topic_key: metadata.topic_key || null,
      reason: text(reason, 1000),
      observed_at: nowIso,
      customer_private_content_included: false,
      source_customer_identifiers_persisted: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
    },
    updated_at: nowIso,
  };
}

function quarantineAgendaRow({ organizationId, releaseRow, reason, nowIso }) {
  const metadata = object(releaseRow.metadata);
  const fingerprintValue = text(metadata.hypothesis_fingerprint, 128) || digest(releaseRow.content);
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AGENDA_SCOPE,
    memory_key: `released-knowledge-revalidate:${fingerprintValue.slice(0, 40)}`,
    memory_type: "goal",
    subject: `released-knowledge-revalidate-${fingerprintValue.slice(0, 20)}`,
    content: [
      `Adversarially revalidate this quarantined previously released knowledge claim: ${text(releaseRow.content, 4000)}`,
      `Quarantine reason: ${text(reason, 500)}.`,
      "Search for current primary evidence, contradictions, failed replications, boundary conditions and changed standards.",
      "Do not restore the claim automatically. A fresh epistemic and explicit final-release cycle is required.",
    ].join(" "),
    importance: 0.99,
    confidence: 1,
    source: "released_knowledge_quarantine_revalidation",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      continuous_learning: true,
      self_directed_learning: true,
      released_knowledge_revalidation: true,
      topic_key: `released-revalidate-${fingerprintValue.slice(0, 20)}`,
      parent_topic_key: metadata.topic_key || null,
      knowledge_domain: metadata.knowledge_domain || null,
      jurisdiction: metadata.jurisdiction || null,
      research_mode: "mechanism",
      status: "READY",
      next_research_at: nowIso,
      review_interval_days: 14,
      freshness_days: 14,
      contradiction_search_required: true,
      failed_replication_search_required: true,
      boundary_condition_search_required: true,
      automatic_restore_allowed: false,
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
    },
    updated_at: nowIso,
  };
}

async function writeEvent(row) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(row, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id")
    .maybeSingle();
  if (result.error) throw result.error;
  return Boolean(result.data?.id);
}

export async function releaseAvantiqoFinalKnowledge({
  hypothesis_fingerprint,
  approval_reason,
  release_note = null,
} = {}) {
  if (!enabled(process.env[RELEASE_APPROVAL_ENV])) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_EXPLICIT_APPROVAL_REQUIRED`);
  }
  const approvalReason = text(approval_reason, 800);
  if (!approvalReason) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_APPROVAL_REASON_REQUIRED`);
  }
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`);
  }
  const hypothesisFingerprint = fingerprint(hypothesis_fingerprint, "HYPOTHESIS_FINGERPRINT");
  const state = await loadReleaseInputs(organizationId, hypothesisFingerprint);
  if (state.existingRelease?.id) {
    const releasedKnowledgeVerifier = createAvantiqoReleasedKnowledgeAuthenticityVerifier();
    if (releasedKnowledgeVerifier.available !== true) {
      throw new Error(
        `${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_RELEASED_KNOWLEDGE_AUTHENTICITY_KEYRING_REQUIRED`,
      );
    }
    if (!releasedKnowledgeVerifier.verify(state.existingRelease)) {
      throw new Error(
        `${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_EXISTING_RELEASE_AUTHENTICITY_REQUIRED`,
      );
    }
    return {
      success: true,
      contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT,
      status: "ALREADY_RELEASED_AUTHENTICATED",
      release_memory_key: state.existingRelease.memory_key,
      platform_knowledge_written: false,
      released_knowledge_authenticity_verified: true,
      idempotent: true,
    };
  }
  if (!state.candidate?.id) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_FINAL_RELEASE_CANDIDATE_NOT_FOUND`);
  }
  const candidateVerifier = createAvantiqoFinalPromotionCandidateAuthenticityVerifier();
  if (candidateVerifier.available !== true) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_KEYRING_REQUIRED`);
  }
  if (!candidateVerifier.verify(state.candidate)) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_FINAL_PROMOTION_CANDIDATE_AUTHENTICITY_REQUIRED`);
  }
  if (!candidateBenchmarkStillEligible(state.candidate)) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_FINAL_RELEASE_CANDIDATE_NOT_ELIGIBLE`);
  }
  if (!state.provisional?.id || !provisionalStillEligible(state.provisional, hypothesisFingerprint)) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_PROVISIONAL_CLAIM_NOT_ELIGIBLE`);
  }
  if (!verifyAvantiqoFinalPromotionCandidateClaimBinding(state.candidate, state.provisional)) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_PROVISIONAL_CLAIM_BINDING_MISMATCH`);
  }

  const provisionalMetadata = object(state.provisional.metadata);
  const graph = await inspectAvantiqoEvidenceGraph({
    organizationId,
    query: state.provisional.content,
    domain: provisionalMetadata.knowledge_domain || null,
    jurisdiction: provisionalMetadata.jurisdiction || null,
    freshnessDays: 90,
    limit: 8,
  }).catch((error) => ({
    contract: "AVANTIQO_EVIDENCE_GRAPH_V1",
    available: false,
    block_knowledge_reuse: true,
    reason: "EVIDENCE_GRAPH_READ_FAILED",
    error: text(error?.message || error, 500),
    matches: [],
    conflicts: [],
  }));
  if (graph.available !== true || graph.block_knowledge_reuse === true || !list(graph.matches).length) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_CURRENT_EVIDENCE_GRAPH_BLOCKS_RELEASE`);
  }

  const support = supportingEvidence(state.provisional.content, state.evidenceRows);
  if (!support) {
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_SUPPORTING_SOURCE_PROVENANCE_REQUIRED`);
  }

  const nowIso = new Date().toISOString();
  const releaseDraft = knowledgeRow({
    organizationId,
    candidate: state.candidate,
    provisional: state.provisional,
    support,
    approvalReason,
    releaseNote: release_note,
    nowIso,
  });
  const releasedKnowledgeSeal = sealAvantiqoReleasedKnowledgeAuthenticity(releaseDraft);
  if (releasedKnowledgeSeal.success !== true || !releasedKnowledgeSeal.row) {
    throw new Error(
      `${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_RELEASED_KNOWLEDGE_AUTHENTICITY_KEYRING_REQUIRED`,
    );
  }
  const row = releasedKnowledgeSeal.row;

  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(row, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id,memory_key,subject,content,confidence,valid_until,metadata,updated_at")
    .single();
  if (written.error) throw written.error;

  const candidateMetadata = object(state.candidate.metadata);
  const candidateUpdate = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({
      metadata: {
        ...candidateMetadata,
        status: "FINAL_KNOWLEDGE_RELEASED",
        production_knowledge_release_authorized: true,
        platform_knowledge_written: true,
        release_memory_key: row.memory_key,
        release_id: row.metadata.release_id,
        released_at: nowIso,
      },
      updated_at: nowIso,
    })
    .eq("organization_id", organizationId)
    .eq("id", state.candidate.id)
    .eq("updated_at", state.candidate.updated_at)
    .select("id")
    .maybeSingle();
  if (candidateUpdate.error) throw candidateUpdate.error;
  if (!candidateUpdate.data?.id) {
    const rollback = await supabaseAdmin
      .from(MEMORY_TABLE)
      .update({
        active: false,
        forgotten_at: nowIso,
        metadata: {
          ...row.metadata,
          release_status: "QUARANTINED_RELEASE_FINALIZATION_CONFLICT",
          reusable_platform_knowledge: false,
          knowledge_router_reuse_allowed: false,
          quarantined_at: nowIso,
          quarantine_reason: "FINAL_CANDIDATE_OPTIMISTIC_UPDATE_CONFLICT",
        },
        updated_at: nowIso,
      })
      .eq("organization_id", organizationId)
      .eq("id", written.data.id);
    if (rollback.error) throw rollback.error;
    throw new Error(`${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_FINALIZATION_CONFLICT_RELEASE_QUARANTINED`);
  }

  const provisionalMetadataAfter = object(state.provisional.metadata);
  const provisionalUpdate = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({
      active: false,
      superseded_by: written.data.id,
      superseded_at: nowIso,
      metadata: {
        ...provisionalMetadataAfter,
        status: "PROMOTED_TO_EXPLICITLY_RELEASED_PLATFORM_KNOWLEDGE",
        released_knowledge_memory_key: row.memory_key,
        released_at: nowIso,
        reusable_platform_knowledge: false,
        knowledge_router_reuse_allowed: false,
        automatic_knowledge_promotion: false,
      },
      updated_at: nowIso,
    })
    .eq("organization_id", organizationId)
    .eq("id", state.provisional.id)
    .eq("updated_at", state.provisional.updated_at);
  if (provisionalUpdate.error) throw provisionalUpdate.error;

  await writeEvent(releaseEventRow({
    organizationId,
    releaseRow: row,
    event: "RELEASED",
    reason: approvalReason,
    nowIso,
  }));

  return {
    success: true,
    contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT,
    status: "FINAL_KNOWLEDGE_RELEASED_AND_MONITORED",
    hypothesis_fingerprint: hypothesisFingerprint,
    release_memory_key: row.memory_key,
    platform_knowledge_written: true,
    explicit_approval_required: true,
    source_count: support.source_count,
    independent_source_host_count: support.independent_source_host_count,
    official_primary_support: support.official_primary_support,
    valid_until: row.valid_until,
    governance: {
      final_promotion_candidate_authenticity_verified: true,
      exact_provisional_claim_binding_verified: true,
      released_knowledge_authenticity_contract:
        AVANTIQO_RELEASED_KNOWLEDGE_AUTHENTICITY_CONTRACT,
      released_knowledge_authenticity_sealed_before_persistence: true,
      database_only_released_claim_mutation_blocks_reuse: true,
      unsigned_legacy_release_compatibility_allowed: false,
      database_only_candidate_forgery_blocks_release: true,
      post_benchmark_provisional_claim_drift_blocks_release: true,
      exact_provisional_claim_released: true,
      benchmark_summary_released_as_claim: false,
      current_evidence_graph_checked: true,
      contradiction_present: false,
      supporting_source_provenance_required: true,
      automatic_knowledge_promotion: false,
      automatic_unquarantine_allowed: false,
      post_release_revalidation_required: true,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      model_training_started: false,
      model_weight_mutation: false,
      model_promotion: false,
      customer_private_content_promoted: false,
      raw_reasoning_persisted: false,
      authorization_effect: "NONE",
    },
  };
}

async function loadReleasedKnowledge(organizationId) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,organization_id,party_id,entity_id,conversation_id,source_turn_id,memory_scope,memory_key,memory_type,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", KNOWLEDGE_SCOPE)
    .eq("source", RELEASE_SOURCE)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(MAX_ROWS);
  if (result.error) throw result.error;
  return list(result.data);
}

function quarantineReason(graph, support) {
  if (graph.available !== true) return "EVIDENCE_GRAPH_UNAVAILABLE";
  if (graph.block_knowledge_reuse === true) return text(graph.reason, 180) || "EVIDENCE_GRAPH_BLOCKS_REUSE";
  if (!list(graph.matches).length) return "CURRENT_RELEVANT_EVIDENCE_GRAPH_MISSING";
  if (!support) return "CURRENT_SUPPORTING_SOURCE_PROVENANCE_INSUFFICIENT";
  return null;
}

export async function reconcileAvantiqoReleasedKnowledgeRevalidation({ persist = true } = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      released_knowledge_count: 0,
    };
  }

  const [releasedRows, evidenceResult] = await Promise.all([
    loadReleasedKnowledge(organizationId),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,subject,content,confidence,active,valid_until,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", EVIDENCE_SCOPE)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(MAX_EVIDENCE_ROWS),
  ]);
  if (evidenceResult.error) throw evidenceResult.error;
  const evidenceRows = list(evidenceResult.data).filter((row) => validEvidenceRow(row));
  const nowIso = new Date().toISOString();
  const quarantined = [];
  const healthy = [];
  const releasedKnowledgeVerifier = createAvantiqoReleasedKnowledgeAuthenticityVerifier();
  if (releasedKnowledgeVerifier.available !== true) {
    return {
      success: false,
      contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT,
      status: "RELEASED_KNOWLEDGE_AUTHENTICITY_BLOCKED",
      reason: "RELEASED_KNOWLEDGE_AUTHENTICITY_KEYRING_REQUIRED",
      released_knowledge_count: releasedRows.length,
      healthy_count: 0,
      quarantine_count: 0,
      governance: {
        released_knowledge_authenticity_required: true,
        unsigned_legacy_release_compatibility_allowed: false,
        provider_free: true,
        authorization_effect: "NONE",
      },
    };
  }

  for (const row of releasedRows) {
    const metadata = object(row.metadata);
    const authenticityValid = releasedKnowledgeVerifier.verify(row);
    const graph = authenticityValid ? await inspectAvantiqoEvidenceGraph({
      organizationId,
      query: row.content,
      domain: metadata.knowledge_domain || null,
      jurisdiction: metadata.jurisdiction || null,
      freshnessDays: metadata.stability === "mutable" ? 30 : 90,
      limit: 8,
    }).catch((error) => ({
      contract: "AVANTIQO_EVIDENCE_GRAPH_V1",
      available: false,
      block_knowledge_reuse: true,
      reason: "EVIDENCE_GRAPH_READ_FAILED",
      error: text(error?.message || error, 500),
      matches: [],
      conflicts: [],
    })) : {
      contract: "AVANTIQO_EVIDENCE_GRAPH_V1",
      available: false,
      block_knowledge_reuse: true,
      reason: "RELEASED_KNOWLEDGE_AUTHENTICITY_INVALID",
      matches: [],
      conflicts: [],
    };
    const support = authenticityValid ? supportingEvidence(row.content, evidenceRows) : null;
    const reason = authenticityValid
      ? quarantineReason(graph, support)
      : "RELEASED_KNOWLEDGE_AUTHENTICITY_INVALID";

    if (reason) {
      quarantined.push({ row, reason, graph });
      if (persist) {
        const nextMetadata = {
          ...metadata,
          release_status: "QUARANTINED",
          reusable_platform_knowledge: false,
          knowledge_router_reuse_allowed: false,
          quarantined_at: nowIso,
          quarantine_reason: reason,
          last_revalidated_at: nowIso,
          automatic_unquarantine_allowed: false,
        };
        const quarantinedSeal = sealAvantiqoReleasedKnowledgeAuthenticity({
          ...row,
          active: false,
          forgotten_at: nowIso,
          metadata: {
            ...nextMetadata,
            released_knowledge_authenticity_resealed_for_quarantine: true,
          },
        });
        if (quarantinedSeal.success !== true || !quarantinedSeal.row) {
          throw new Error(
            `${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_QUARANTINE_AUTHENTICITY_RESEAL_REQUIRED`,
          );
        }
        const update = await supabaseAdmin
          .from(MEMORY_TABLE)
          .update({
            active: false,
            forgotten_at: nowIso,
            metadata: quarantinedSeal.row.metadata,
            updated_at: nowIso,
          })
          .eq("organization_id", organizationId)
          .eq("id", row.id)
          .eq("updated_at", row.updated_at)
          .select("id")
          .maybeSingle();
        if (update.error) throw update.error;
        if (update.data?.id) {
          await Promise.all([
            writeEvent(releaseEventRow({
              organizationId,
              releaseRow: { ...row, metadata: nextMetadata },
              event: "QUARANTINED",
              reason,
              nowIso,
            })),
            supabaseAdmin
              .from(MEMORY_TABLE)
              .upsert(quarantineAgendaRow({ organizationId, releaseRow: row, reason, nowIso }), {
                onConflict: "organization_id,memory_scope,memory_key",
              })
              .select("id"),
          ]).then((results) => {
            const agendaResult = results[1];
            if (agendaResult.error) throw agendaResult.error;
          });
        }
      }
      continue;
    }

    healthy.push({ row, graph, support });
    if (persist) {
      const validityDays = knowledgeValidityDays(metadata.stability === "mutable" ? "mutable" : "stable");
      const nextMetadata = {
        ...metadata,
        release_status: "RELEASED_MONITORED",
        last_revalidated_at: nowIso,
        next_revalidation_at: new Date(Date.now() + Math.max(1, Math.floor(validityDays / 3)) * DAY_MS)
          .toISOString(),
        current_evidence_graph_reason: graph.reason || null,
        current_source_count: support.source_count,
        current_independent_source_host_count: support.independent_source_host_count,
        current_official_primary_support: support.official_primary_support,
      };
      const revalidatedSeal = sealAvantiqoReleasedKnowledgeAuthenticity({
        ...row,
        metadata: {
          ...nextMetadata,
          released_knowledge_authenticity_resealed_after_revalidation: true,
        },
      });
      if (revalidatedSeal.success !== true || !revalidatedSeal.row) {
        throw new Error(
          `${AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT}_REVALIDATION_AUTHENTICITY_RESEAL_REQUIRED`,
        );
      }
      const update = await supabaseAdmin
        .from(MEMORY_TABLE)
        .update({ metadata: revalidatedSeal.row.metadata, updated_at: nowIso })
        .eq("organization_id", organizationId)
        .eq("id", row.id)
        .eq("updated_at", row.updated_at);
      if (update.error) throw update.error;
    }
  }

  return {
    success: true,
    contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT,
    status: quarantined.length ? "RELEASED_KNOWLEDGE_QUARANTINED" : "RELEASED_KNOWLEDGE_REVALIDATED",
    released_knowledge_count: releasedRows.length,
    healthy_count: healthy.length,
    quarantine_count: quarantined.length,
    quarantined: quarantined.slice(0, 20).map((entry) => ({
      memory_key: entry.row.memory_key,
      hypothesis_fingerprint: text(object(entry.row.metadata).hypothesis_fingerprint, 128) || null,
      reason: entry.reason,
    })),
    monitoring_policy: {
      evidence_graph_unavailable_quarantines: true,
      evidence_conflict_quarantines: true,
      stale_evidence_quarantines: true,
      missing_supporting_source_provenance_quarantines: true,
      invalid_released_knowledge_authenticity_quarantines: true,
      healthy_revalidation_reseals_authenticity: true,
      unsigned_legacy_release_compatibility_allowed: false,
      quarantine_removes_knowledge_router_visibility: true,
      quarantine_enqueues_adversarial_revalidation: true,
      automatic_unquarantine_allowed: false,
      explicit_fresh_release_cycle_required_after_quarantine: true,
    },
    governance: {
      provider_free: true,
      automatic_knowledge_release: false,
      automatic_unquarantine: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      model_training_started: false,
      model_weight_mutation: false,
      model_promotion: false,
      customer_private_content_promoted: false,
      raw_reasoning_persisted: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoFinalKnowledgeReleaseRuntime = Object.freeze({
  contract: AVANTIQO_FINAL_KNOWLEDGE_RELEASE_CONTRACT,
  release: releaseAvantiqoFinalKnowledge,
  reconcile: reconcileAvantiqoReleasedKnowledgeRevalidation,
  release_source: RELEASE_SOURCE,
  approval_env: RELEASE_APPROVAL_ENV,
});
