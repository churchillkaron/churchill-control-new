import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { inspectAvantiqoEvidenceGraph } from "@/lib/intelligence/runtime/AvantiqoEvidenceGraphRuntime";

export const AVANTIQO_EPISTEMIC_PROMOTION_CONTRACT =
  "AVANTIQO_EPISTEMIC_PROMOTION_V1";

const MEMORY_TABLE = "intelligence_memories";
const CANDIDATE_SCOPE = "platform_learning_experimental_knowledge_candidates";
const PROVISIONAL_SCOPE = "platform_provisional_knowledge";
const AGENDA_SCOPE = "platform_learning_agenda";
const MAX_CANDIDATES = 300;
const REVIEW_DAYS = 30;
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

function learningScopeId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function hash(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 12000).toLowerCase()).join("|"))
    .digest("hex");
}

function externalSupport(graph) {
  const matches = list(graph?.matches);
  const claims = matches.flatMap((match) => list(object(match?.metadata).claims));
  const supported = claims.filter((claim) => text(claim?.status, 40) === "SUPPORTED");
  const conflicted = claims.filter((claim) => text(claim?.status, 40) === "CONFLICTED");
  const independentHosts = new Set(
    supported.flatMap((claim) => list(claim?.support_sources))
      .map((source) => {
        try {
          return new URL(text(source?.url, 2000)).hostname.replace(/^www\./, "");
        } catch {
          return null;
        }
      })
      .filter(Boolean),
  );
  return {
    supported_claim_count: supported.length,
    conflicted_claim_count: conflicted.length,
    independent_source_host_count: independentHosts.size,
    official_primary_support: supported.some((claim) => claim?.official_primary_support === true),
  };
}

function reviewStatus(candidate, graph, support) {
  const metadata = object(candidate.metadata);
  if (metadata.reusable_platform_knowledge === true) return "INVALID_ALREADY_REUSABLE";
  if (metadata.automatic_knowledge_promotion === true) return "INVALID_AUTOMATIC_PROMOTION";
  if (graph?.block_knowledge_reuse === true || support.conflicted_claim_count > 0) {
    return "ADVERSARIAL_CONTRADICTION_BLOCKED";
  }
  if (graph?.available !== true || support.supported_claim_count < 1) {
    return "EXTERNAL_RECONCILIATION_REQUIRED";
  }
  if (!support.official_primary_support && support.independent_source_host_count < 2) {
    return "SOURCE_DIVERSITY_REVIEW_REQUIRED";
  }
  if (
    Number(metadata.verified_result_count || 0) < 5 ||
    Number(metadata.independent_replication_count || 0) < 3 ||
    Number(metadata.verification_method_count || 0) < 2 ||
    Number(metadata.refute_count || 0) !== 0
  ) {
    return "EXPERIMENTAL_REPLICATION_GATE_FAILED";
  }
  return "PROVISIONAL_KNOWLEDGE_READY";
}

function provisionalRow({ organizationId, candidate, graph, support, nowIso }) {
  const metadata = object(candidate.metadata);
  const fingerprint = text(metadata.hypothesis_fingerprint, 128) || hash(candidate.content);
  const nextReviewAt = new Date(Date.now() + REVIEW_DAYS * DAY_MS).toISOString();
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: PROVISIONAL_SCOPE,
    memory_key: `provisional-knowledge:${fingerprint.slice(0, 40)}`,
    memory_type: "lesson",
    subject: candidate.subject,
    content: candidate.content,
    importance: Math.max(0.75, Number(candidate.importance || 0.8)),
    confidence: Math.min(0.9, Math.max(0.75, Number(candidate.confidence || 0.8))),
    source: "adversarial_epistemic_review",
    active: true,
    valid_until: nextReviewAt,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_EPISTEMIC_PROMOTION_CONTRACT,
      hypothesis_fingerprint: fingerprint,
      root_topic_key: metadata.root_topic_key || candidate.subject,
      synthesis_fingerprint: metadata.synthesis_fingerprint || null,
      status: "PROVISIONAL_SHADOW_ONLY",
      epistemic_state: "PROVISIONAL_NOT_CANONICAL",
      experimental_result_count: Number(metadata.verified_result_count || 0),
      independent_replication_count: Number(metadata.independent_replication_count || 0),
      verification_method_count: Number(metadata.verification_method_count || 0),
      external_evidence_graph_contract: graph?.contract || null,
      external_supported_claim_count: support.supported_claim_count,
      external_conflicted_claim_count: support.conflicted_claim_count,
      external_independent_source_host_count: support.independent_source_host_count,
      external_official_primary_support: support.official_primary_support,
      shadow_reuse_only: true,
      reusable_platform_knowledge: false,
      knowledge_router_reuse_allowed: false,
      explicit_final_promotion_required: true,
      rollback_on_conflict: true,
      next_epistemic_review_at: nextReviewAt,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      authorization_value: "none",
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      reviewed_at: nowIso,
    },
    updated_at: nowIso,
  };
}

function reconciliationAgendaRow({ organizationId, candidate, nowIso }) {
  const metadata = object(candidate.metadata);
  const root = text(metadata.root_topic_key || candidate.subject, 240);
  const fingerprint = text(metadata.hypothesis_fingerprint, 128) || hash(candidate.content);
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AGENDA_SCOPE,
    memory_key: `epistemic-reconcile:${fingerprint.slice(0, 40)}`,
    memory_type: "goal",
    subject: `epistemic-reconcile-${fingerprint.slice(0, 20)}`,
    content: [
      `Adversarially verify this experimentally supported hypothesis before any reusable knowledge promotion: ${text(candidate.content, 3000)}`,
      "Search specifically for contradictory evidence, boundary conditions, failed replications, alternative mechanisms and authoritative primary evidence.",
      "Do not treat absence of contradiction as proof. Distinguish contexts where the claim holds from contexts where it fails.",
    ].join(" "),
    importance: 0.95,
    confidence: 1,
    source: "epistemic_promotion_reconciliation",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      continuous_learning: true,
      self_directed_learning: true,
      epistemic_reconciliation: true,
      topic_key: `epistemic-${fingerprint.slice(0, 20)}`,
      parent_topic_key: root,
      research_mode: "mechanism",
      status: "READY",
      next_research_at: nowIso,
      review_interval_days: 30,
      freshness_days: 30,
      contradiction_search_required: true,
      boundary_condition_search_required: true,
      failed_replication_search_required: true,
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
    },
    updated_at: nowIso,
  };
}

async function loadCandidates(organizationId) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,subject,content,importance,confidence,active,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", CANDIDATE_SCOPE)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(MAX_CANDIDATES);
  if (result.error) throw result.error;
  return list(result.data).filter((row) =>
    text(object(row.metadata).status, 120) === "READY_FOR_EPISTEMIC_KNOWLEDGE_REVIEW",
  );
}

async function upsertRows(rows) {
  if (!rows.length) return 0;
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(rows, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id");
  if (result.error) throw result.error;
  return list(result.data).length;
}

export async function reconcileAvantiqoEpistemicPromotion({ persist = true } = {}) {
  const organizationId = learningScopeId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_EPISTEMIC_PROMOTION_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      reviewed_candidate_count: 0,
    };
  }

  const candidates = await loadCandidates(organizationId);
  const nowIso = new Date().toISOString();
  const provisionalRows = [];
  const agendaRows = [];
  const reviews = [];

  for (const candidate of candidates) {
    const metadata = object(candidate.metadata);
    const graph = await inspectAvantiqoEvidenceGraph({
      organizationId,
      query: candidate.content,
      domain: metadata.knowledge_domain || null,
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
    const support = externalSupport(graph);
    const status = reviewStatus(candidate, graph, support);
    if (status === "PROVISIONAL_KNOWLEDGE_READY") {
      provisionalRows.push(provisionalRow({ organizationId, candidate, graph, support, nowIso }));
    } else if ([
      "EXTERNAL_RECONCILIATION_REQUIRED",
      "SOURCE_DIVERSITY_REVIEW_REQUIRED",
      "ADVERSARIAL_CONTRADICTION_BLOCKED",
    ].includes(status)) {
      agendaRows.push(reconciliationAgendaRow({ organizationId, candidate, nowIso }));
    }
    reviews.push({
      hypothesis_fingerprint: text(metadata.hypothesis_fingerprint, 128) || null,
      root_topic_key: text(metadata.root_topic_key || candidate.subject, 240) || null,
      status,
      evidence_graph_available: graph.available === true,
      evidence_graph_blocks_reuse: graph.block_knowledge_reuse === true,
      ...support,
    });
  }

  let provisionalWrites = 0;
  let agendaWrites = 0;
  if (persist) {
    provisionalWrites = await upsertRows(provisionalRows);
    agendaWrites = await upsertRows(agendaRows);
  }

  return {
    success: true,
    contract: AVANTIQO_EPISTEMIC_PROMOTION_CONTRACT,
    status: candidates.length ? "EPISTEMIC_REVIEW_COMPLETE" : "NO_REVIEW_CANDIDATES",
    reviewed_candidate_count: candidates.length,
    provisional_shadow_candidate_count: provisionalRows.length,
    provisional_shadow_write_count: provisionalWrites,
    reconciliation_agenda_count: agendaRows.length,
    reconciliation_agenda_write_count: agendaWrites,
    reviews,
    epistemic_policy: {
      experiment_alone_can_create_reusable_knowledge: false,
      external_adversarial_reconciliation_required: true,
      contradiction_blocks_promotion: true,
      source_diversity_required: true,
      provisional_knowledge_is_shadow_only: true,
      provisional_knowledge_router_reuse_allowed: false,
      explicit_final_promotion_required: true,
      rollback_on_future_conflict: true,
    },
    governance: {
      provider_free: true,
      web_research_executed_here: false,
      product_action_authorized: false,
      automatic_knowledge_promotion: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      customer_private_content_promoted: false,
      raw_reasoning_persisted: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoEpistemicPromotionRuntime = Object.freeze({
  contract: AVANTIQO_EPISTEMIC_PROMOTION_CONTRACT,
  reconcile: reconcileAvantiqoEpistemicPromotion,
});
