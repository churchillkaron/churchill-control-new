import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_CONTRACT =
  "AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_V1";

const MEMORY_TABLE = "intelligence_memories";
const EVIDENCE_CANDIDATE_SCOPE = "platform_learning_evidence_candidates";
const AGENDA_SCOPE = "platform_learning_agenda";
const MAX_CANDIDATES = 300;
const MAX_AGENDA_WRITES = 40;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function bounded(value, fallback = 0.8, minimum = 0, maximum = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function learningScopeId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 12000).toLowerCase()).join("|"))
    .digest("hex");
}

function candidateEligible(row) {
  const metadata = object(row?.metadata);
  return Boolean(
    row?.active === true &&
    text(metadata.contract, 180) === "AVANTIQO_CONTINUOUS_LEARNING_EVIDENCE_CANDIDATE_V1" &&
    text(metadata.epistemic_state, 120) === "EVIDENCE_CANDIDATE_NOT_RELEASED" &&
    metadata.reusable_platform_knowledge !== true &&
    metadata.knowledge_router_reuse_allowed !== true &&
    metadata.automatic_knowledge_promotion !== true &&
    metadata.customer_private_memory !== true &&
    text(row?.content, 4000)
  );
}

function bridgeAgendaRow({ organizationId, candidate, nowIso }) {
  const metadata = object(candidate.metadata);
  const claim = text(candidate.content, 4000);
  const fingerprint = digest(
    "learning-evidence-bridge",
    metadata.topic_key || candidate.subject,
    claim,
  );
  const topicKey = `evidence-verify-${fingerprint.slice(0, 20)}`;
  const parentTopicKey = text(metadata.topic_key, 240) || text(candidate.subject, 240);
  const sourceCount = Math.max(0, Number(metadata.source_count || 0));

  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AGENDA_SCOPE,
    memory_key: `evidence-mechanism-agenda:${fingerprint.slice(0, 40)}`,
    memory_type: "goal",
    subject: topicKey,
    content: [
      `Adversarially investigate this supported public-evidence candidate before it can become reusable knowledge: ${claim}`,
      "Do not assume the claim is true because sources support it.",
      "Map the mechanism that would make it true, identify boundary conditions and contexts where it fails, search for contradictory evidence and failed replications, separate fundamental from changeable constraints, and formulate falsifiable competing hypotheses.",
      "Design discriminating experiments or counterexamples that could refute the candidate. Existing implementations are evidence, not the boundary of possible solutions.",
    ].join(" "),
    importance: Math.min(0.98, Math.max(0.72, bounded(candidate.importance, 0.8) + 0.04)),
    confidence: 1,
    source: "continuous_learning_evidence_candidate_bridge",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_CONTRACT,
      continuous_learning: true,
      self_directed_learning: true,
      mechanism_first_learning: true,
      evidence_candidate_bridge: true,
      evidence_candidate_memory_key: text(candidate.memory_key, 240) || null,
      evidence_candidate_fingerprint: fingerprint,
      evidence_candidate_source_count: sourceCount,
      topic_key: topicKey,
      parent_topic_key: parentTopicKey || null,
      root_topic_key: parentTopicKey || topicKey,
      knowledge_domain: text(metadata.knowledge_domain, 120) || null,
      jurisdiction: text(metadata.jurisdiction, 120) || null,
      stability: text(metadata.stability, 80) || "stable",
      research_mode: "mechanism",
      status: "READY",
      next_research_at: nowIso,
      failure_count: 0,
      lease_token: null,
      lease_expires_at: null,
      contradiction_search_required: true,
      boundary_condition_search_required: true,
      mechanism_mapping_required: true,
      falsifiable_competing_hypotheses_required: true,
      discriminating_experiments_required: true,
      direct_platform_knowledge_promotion_allowed: false,
      reusable_platform_knowledge: false,
      knowledge_router_reuse_allowed: false,
      automatic_knowledge_promotion: false,
      automatic_gpu_execution: false,
      automatic_runpod_submission: false,
      automatic_experiment_execution: false,
      automatic_model_weight_mutation: false,
      synthesis_safe_lease_required: true,
      synthesis_safe_lease_contract: "AVANTIQO_RUNPOD_SAFE_LEASE_V2",
      synthesis_execution_lane: "intelligence-deep",
      synthesis_spend_approval_required: true,
      customer_private_content_included: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
      created_by: "continuous_learning_evidence_candidate_bridge",
      updated_at: nowIso,
    },
    updated_at: nowIso,
  };
}

async function loadCandidates(organizationId) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,subject,content,importance,confidence,active,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", EVIDENCE_CANDIDATE_SCOPE)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(MAX_CANDIDATES);
  if (result.error) throw result.error;
  return list(result.data).filter(candidateEligible);
}

async function upsertAgenda(rows) {
  if (!rows.length) return 0;
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(rows, {
      onConflict: "organization_id,memory_scope,memory_key",
      ignoreDuplicates: true,
    })
    .select("id");
  if (result.error) throw result.error;
  return list(result.data).length;
}

export async function reconcileAvantiqoLearningEvidenceCandidates({
  persist = true,
  limit = MAX_AGENDA_WRITES,
} = {}) {
  const organizationId = learningScopeId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      reviewed_candidate_count: 0,
      mechanism_agenda_count: 0,
    };
  }

  const candidates = await loadCandidates(organizationId);
  const nowIso = new Date().toISOString();
  const maximum = Math.max(1, Math.min(MAX_AGENDA_WRITES, Number(limit) || MAX_AGENDA_WRITES));
  const agendaRows = candidates
    .slice(0, maximum)
    .map((candidate) => bridgeAgendaRow({ organizationId, candidate, nowIso }));
  const writeCount = persist ? await upsertAgenda(agendaRows) : 0;

  return {
    success: true,
    contract: AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_CONTRACT,
    status: candidates.length ? "EVIDENCE_CANDIDATES_BRIDGED_TO_MECHANISM_REVIEW" : "NO_EVIDENCE_CANDIDATES",
    reviewed_candidate_count: candidates.length,
    mechanism_agenda_count: agendaRows.length,
    mechanism_agenda_write_count: writeCount,
    policy: {
      direct_platform_knowledge_promotion_allowed: false,
      evidence_candidate_is_fact: false,
      adversarial_mechanism_review_required: true,
      contradiction_search_required: true,
      boundary_condition_search_required: true,
      falsifiable_hypotheses_required: true,
      governed_experiments_required_before_epistemic_promotion: true,
      safe_lease_required_for_owned_deep_synthesis: true,
      explicit_synthesis_spend_approval_required: true,
    },
    governance: {
      provider_free: true,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      automatic_gpu_execution: false,
      automatic_experiment_execution: false,
      automatic_knowledge_promotion: false,
      reusable_platform_knowledge_written: false,
      prior_released_knowledge_retired: false,
      customer_private_content_promoted: false,
      raw_reasoning_persisted: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoLearningEvidenceCandidateBridgeRuntime = Object.freeze({
  contract: AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_CONTRACT,
  reconcile: reconcileAvantiqoLearningEvidenceCandidates,
});

export default reconcileAvantiqoLearningEvidenceCandidates;
