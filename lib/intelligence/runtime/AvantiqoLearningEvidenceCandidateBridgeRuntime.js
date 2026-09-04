import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_CONTRACT =
  "AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_V1";
export const AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_ADMISSION_CONTRACT =
  "AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_ADMISSION_V1";

const MEMORY_TABLE = "intelligence_memories";
const EVIDENCE_CANDIDATE_SCOPE = "platform_learning_evidence_candidates";
const AGENDA_SCOPE = "platform_learning_agenda";
const EVIDENCE_CANDIDATE_CONTRACT =
  "AVANTIQO_CONTINUOUS_LEARNING_EVIDENCE_CANDIDATE_V1";
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

function parsedTime(value) {
  const parsed = Date.parse(text(value, 120));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedNowMs(now) {
  if (now instanceof Date) return now.getTime();
  if (typeof now === "number") return Number.isFinite(now) ? now : Date.now();
  const parsed = Date.parse(text(now, 120));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function legacyPublicEvidenceCandidateExplicitlyBounded(row, metadata) {
  if (text(row?.source, 180) !== "continuous_learning_evidence_candidate") return false;
  if (metadata.customer_private_memory !== false) return false;
  if (text(metadata.evidence_status, 80).toUpperCase() !== "SUPPORTED") return false;
  if (Number(metadata.source_count || 0) < 1) return false;
  if (
    !list(metadata.sources).some((source) =>
      /^https?:\/\//i.test(text(object(source).url, 2000)),
    )
  ) {
    return false;
  }
  if (metadata.reusable_platform_knowledge !== false) return false;
  if (metadata.knowledge_router_reuse_allowed !== false) return false;
  if (metadata.automatic_knowledge_promotion !== false) return false;
  if (metadata.explicit_final_promotion_required !== true) return false;
  if (metadata.requires_epistemic_promotion_pipeline !== true) return false;
  if (metadata.raw_reasoning_persisted !== false) return false;
  if (text(metadata.authorization_value, 40).toLowerCase() !== "none") return false;
  return true;
}

export function assessAvantiqoLearningEvidenceCandidateBridgeEligibility(
  row = {},
  { now = new Date() } = {},
) {
  const metadata = object(row?.metadata);
  const blockers = [];
  const nowMs = normalizedNowMs(now);
  const expiryMs = parsedTime(row?.valid_until);
  const legacyPublicEvidenceCompatibility =
    legacyPublicEvidenceCandidateExplicitlyBounded(row, metadata);

  if (row?.active !== true) blockers.push("CANDIDATE_ACTIVE_REQUIRED");
  if (row?.forgotten_at || row?.superseded_at || row?.superseded_by) {
    blockers.push("CANDIDATE_NOT_SUPERSEDED_OR_FORGOTTEN_REQUIRED");
  }
  if (expiryMs !== null && expiryMs <= nowMs) {
    blockers.push("CANDIDATE_NOT_EXPIRED_REQUIRED");
  }
  if (text(row?.memory_scope, 180) !== EVIDENCE_CANDIDATE_SCOPE) {
    blockers.push("EVIDENCE_CANDIDATE_SCOPE_REQUIRED");
  }
  if (text(metadata.contract, 180) !== EVIDENCE_CANDIDATE_CONTRACT) {
    blockers.push("EVIDENCE_CANDIDATE_CONTRACT_REQUIRED");
  }
  if (text(metadata.epistemic_state, 120) !== "EVIDENCE_CANDIDATE_NOT_RELEASED") {
    blockers.push("UNRELEASED_EPISTEMIC_STATE_REQUIRED");
  }
  if (metadata.reusable_platform_knowledge !== false) {
    blockers.push("REUSABLE_PLATFORM_KNOWLEDGE_EXPLICIT_FALSE_REQUIRED");
  }
  if (metadata.knowledge_router_reuse_allowed !== false) {
    blockers.push("KNOWLEDGE_ROUTER_REUSE_EXPLICIT_FALSE_REQUIRED");
  }
  if (metadata.automatic_knowledge_promotion !== false) {
    blockers.push("AUTOMATIC_KNOWLEDGE_PROMOTION_EXPLICIT_FALSE_REQUIRED");
  }
  if (metadata.explicit_final_promotion_required !== true) {
    blockers.push("EXPLICIT_FINAL_PROMOTION_REQUIRED");
  }
  if (metadata.requires_epistemic_promotion_pipeline !== true) {
    blockers.push("EPISTEMIC_PROMOTION_PIPELINE_REQUIRED");
  }
  if (metadata.customer_private_memory !== false) {
    blockers.push("CUSTOMER_PRIVATE_MEMORY_EXPLICIT_FALSE_REQUIRED");
  }
  if (
    metadata.customer_private_content_included !== false &&
    !legacyPublicEvidenceCompatibility
  ) {
    blockers.push("CUSTOMER_PRIVATE_CONTENT_EXPLICIT_FALSE_REQUIRED");
  }
  if (metadata.raw_reasoning_persisted !== false) {
    blockers.push("RAW_REASONING_PERSISTENCE_EXPLICIT_FALSE_REQUIRED");
  }
  if (
    metadata.direct_platform_knowledge_write_allowed !== false &&
    !legacyPublicEvidenceCompatibility
  ) {
    blockers.push("DIRECT_PLATFORM_KNOWLEDGE_WRITE_EXPLICIT_FALSE_REQUIRED");
  }
  if (text(metadata.authorization_value, 40).toLowerCase() !== "none") {
    blockers.push("AUTHORIZATION_VALUE_NONE_REQUIRED");
  }
  if (Number(metadata.source_count || 0) < 1) {
    blockers.push("EVIDENCE_SOURCE_COUNT_REQUIRED");
  }
  if (!text(metadata.topic_key, 240)) {
    blockers.push("EVIDENCE_TOPIC_KEY_REQUIRED");
  }
  if (!text(metadata.knowledge_domain, 120)) {
    blockers.push("EVIDENCE_KNOWLEDGE_DOMAIN_REQUIRED");
  }
  if (!text(row?.content, 4000)) {
    blockers.push("EVIDENCE_CANDIDATE_CONTENT_REQUIRED");
  }

  return {
    success: true,
    contract: AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_ADMISSION_CONTRACT,
    eligible: blockers.length === 0,
    status: blockers.length === 0
      ? "EVIDENCE_CANDIDATE_ADMITTED_TO_MECHANISM_REVIEW"
      : "EVIDENCE_CANDIDATE_REJECTED_BY_ADMISSION_GUARD",
    blockers,
    compatibility_path: blockers.length === 0 && legacyPublicEvidenceCompatibility
      ? "LEGACY_PUBLIC_WEB_EVIDENCE_EXPLICIT_SOURCE_GUARD"
      : null,
    policy: {
      admission_fail_closed: true,
      candidate_is_not_fact: true,
      candidate_is_not_reusable_knowledge: true,
      current_not_superseded_not_forgotten_not_expired_required: true,
      explicit_final_promotion_required: true,
      epistemic_promotion_pipeline_required: true,
      customer_private_memory_explicit_false_required: true,
      customer_private_content_explicit_false_required: true,
      raw_reasoning_persistence_explicit_false_required: true,
      direct_platform_knowledge_write_explicit_false_required: true,
      authorization_value_none_required: true,
      evidence_source_count_required: true,
      legacy_public_web_compatibility_is_narrow_and_observational: true,
    },
  };
}

function bridgeAgendaRow({ organizationId, candidate, admission, nowIso }) {
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
      `Adversarially investigate this supported evidence candidate before it can become reusable knowledge: ${claim}`,
      "Do not assume the claim is true because observations, sources, or prior verified outcomes support it.",
      "Map the mechanism that would make it true, identify boundary conditions and contexts where it fails, search for contradictory evidence and failed replications, separate fundamental from changeable constraints, and formulate falsifiable competing hypotheses.",
      "Design discriminating experiments or counterexamples that could refute the candidate. Existing implementations and observed associations are evidence, not proof of causation or the boundary of possible solutions.",
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
      evidence_candidate_source: text(candidate.source, 180) || null,
      evidence_candidate_ingress_contract:
        text(metadata.ingress_contract || metadata.contract, 180) || null,
      evidence_candidate_epistemic_state: text(metadata.epistemic_state, 120) || null,
      evidence_candidate_causal_attribution_status:
        text(metadata.causal_attribution_status, 120) || null,
      evidence_candidate_admission_contract: admission.contract,
      evidence_candidate_admission_compatibility_path: admission.compatibility_path,
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
    .select("id,memory_key,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", EVIDENCE_CANDIDATE_SCOPE)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(MAX_CANDIDATES);
  if (result.error) throw result.error;
  return list(result.data);
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

function blockerCounts(assessments) {
  const counts = {};
  for (const assessment of assessments) {
    for (const blocker of assessment.blockers) {
      counts[blocker] = Number(counts[blocker] || 0) + 1;
    }
  }
  return counts;
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
      eligible_candidate_count: 0,
      rejected_candidate_count: 0,
      mechanism_agenda_count: 0,
    };
  }

  const candidates = await loadCandidates(organizationId);
  const now = new Date();
  const nowIso = now.toISOString();
  const assessments = candidates.map((candidate) => ({
    candidate,
    admission: assessAvantiqoLearningEvidenceCandidateBridgeEligibility(
      candidate,
      { now },
    ),
  }));
  const eligible = assessments.filter((entry) => entry.admission.eligible);
  const rejected = assessments.filter((entry) => !entry.admission.eligible);
  const maximum = Math.max(1, Math.min(MAX_AGENDA_WRITES, Number(limit) || MAX_AGENDA_WRITES));
  const agendaRows = eligible
    .slice(0, maximum)
    .map(({ candidate, admission }) =>
      bridgeAgendaRow({ organizationId, candidate, admission, nowIso }),
    );
  const writeCount = persist ? await upsertAgenda(agendaRows) : 0;

  return {
    success: true,
    contract: AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_CONTRACT,
    status: eligible.length
      ? "EVIDENCE_CANDIDATES_BRIDGED_TO_MECHANISM_REVIEW"
      : candidates.length
        ? "EVIDENCE_CANDIDATES_REJECTED_BY_ADMISSION_GUARD"
        : "NO_EVIDENCE_CANDIDATES",
    reviewed_candidate_count: candidates.length,
    eligible_candidate_count: eligible.length,
    rejected_candidate_count: rejected.length,
    compatibility_candidate_count: eligible.filter(
      (entry) => Boolean(entry.admission.compatibility_path),
    ).length,
    rejection_blocker_counts: blockerCounts(rejected.map((entry) => entry.admission)),
    mechanism_agenda_count: agendaRows.length,
    mechanism_agenda_write_count: writeCount,
    policy: {
      candidate_admission_fail_closed: true,
      direct_platform_knowledge_promotion_allowed: false,
      evidence_candidate_is_fact: false,
      adversarial_mechanism_review_required: true,
      contradiction_search_required: true,
      boundary_condition_search_required: true,
      falsifiable_hypotheses_required: true,
      governed_experiments_required_before_epistemic_promotion: true,
      safe_lease_required_for_owned_deep_synthesis: true,
      explicit_synthesis_spend_approval_required: true,
      explicit_final_knowledge_promotion_required: true,
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
  admission_contract: AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_ADMISSION_CONTRACT,
  assessEligibility: assessAvantiqoLearningEvidenceCandidateBridgeEligibility,
  reconcile: reconcileAvantiqoLearningEvidenceCandidates,
});

export default reconcileAvantiqoLearningEvidenceCandidates;
