import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import CoreRuntime, {
  AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_ADMISSION_CONTRACT,
  AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_CONTRACT,
  AVANTIQO_LEARNING_EVIDENCE_MECHANISM_AGENDA_CONTRACT,
  assessAvantiqoLearningEvidenceCandidateBridgeEligibility as assessCoreEligibility,
  buildAvantiqoLearningEvidenceMechanismAgendaRow as buildCoreMechanismAgendaRow,
} from "./AvantiqoLearningEvidenceCandidateBridgeCoreRuntime.js";
import {
  AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_ALGORITHM,
  AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_CONTRACT,
  createAvantiqoLearningEvidenceCandidateAuthenticityVerifier,
} from "./AvantiqoLearningEvidenceCandidateAuthenticityRuntime.js";
import {
  AVANTIQO_LEARNING_MECHANISM_AGENDA_AUTHENTICITY_ALGORITHM,
  AVANTIQO_LEARNING_MECHANISM_AGENDA_AUTHENTICITY_CONTRACT,
  createAvantiqoLearningMechanismAgendaAuthenticityVerifier,
  sealAvantiqoLearningMechanismAgendaAuthenticity,
} from "./AvantiqoLearningMechanismAgendaAuthenticityRuntime.js";

export {
  AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_ADMISSION_CONTRACT,
  AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_CONTRACT,
  AVANTIQO_LEARNING_EVIDENCE_MECHANISM_AGENDA_CONTRACT,
};

const MEMORY_TABLE = "intelligence_memories";
const EVIDENCE_CANDIDATE_SCOPE = "platform_learning_evidence_candidates";
const MAX_CANDIDATES = 300;
const MAX_AGENDA_WRITES = 40;
const MAX_RETIRED_CANDIDATE_PROVENANCE = 300;

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

function verifierFromOptions(options = {}) {
  return options?.authenticity_verifier ||
    createAvantiqoLearningEvidenceCandidateAuthenticityVerifier();
}

export function assessAvantiqoLearningEvidenceCandidateBridgeEligibility(
  row = {},
  options = {},
) {
  const verifier = verifierFromOptions(options);
  const base = assessCoreEligibility(row, options);
  const blockers = [...list(base.blockers)];

  if (!verifier.available) {
    blockers.push("EVIDENCE_CANDIDATE_AUTHENTICITY_KEYRING_REQUIRED");
  } else if (!verifier.verify(row)) {
    blockers.push("EVIDENCE_CANDIDATE_AUTHENTICITY_REQUIRED");
  }

  const uniqueBlockers = [...new Set(blockers)];
  const eligible = uniqueBlockers.length === 0;
  return {
    ...base,
    eligible,
    status: eligible
      ? "EVIDENCE_CANDIDATE_AUTHENTICATED_AND_ADMITTED_TO_MECHANISM_REVIEW"
      : "EVIDENCE_CANDIDATE_REJECTED_BY_ADMISSION_GUARD",
    blockers: uniqueBlockers,
    compatibility_path: eligible ? base.compatibility_path || null : null,
    evidence_candidate_authenticity_available: verifier.available === true,
    evidence_candidate_authenticity_verified:
      verifier.available === true && verifier.verify(row),
    policy: {
      ...object(base.policy),
      evidence_candidate_authenticity_required: true,
      evidence_candidate_authenticity_contract:
        AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_CONTRACT,
      evidence_candidate_authenticity_algorithm:
        AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_ALGORITHM,
      evidence_candidate_authenticity_domain_separated_from_observation: true,
      server_only_evidence_candidate_authenticity_key_required: true,
      database_stored_evidence_candidate_secret_allowed: false,
      database_only_writer_cannot_reseal_evidence_candidate_without_server_key: true,
      evidence_candidate_authenticity_key_rotation_supported: true,
      unsigned_candidate_compatibility_allowed: false,
    },
  };
}

export function buildAvantiqoLearningEvidenceMechanismAgendaRow({
  organizationId,
  candidate,
  now = new Date(),
  authenticity_verifier = null,
} = {}) {
  const verifier = authenticity_verifier ||
    createAvantiqoLearningEvidenceCandidateAuthenticityVerifier();
  const admission = assessAvantiqoLearningEvidenceCandidateBridgeEligibility(
    candidate,
    { now, authenticity_verifier: verifier },
  );
  if (!admission.eligible) {
    throw new Error(
      `AVANTIQO_LEARNING_EVIDENCE_MECHANISM_AGENDA_CANDIDATE_NOT_AUTHENTICATED:${admission.blockers.join(",")}`,
    );
  }

  const row = buildCoreMechanismAgendaRow({ organizationId, candidate, now });
  const candidateMetadata = object(candidate?.metadata);
  row.metadata = {
    ...object(row.metadata),
    evidence_candidate_authenticity_verified: true,
    evidence_candidate_authenticity_contract:
      AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_CONTRACT,
    evidence_candidate_authenticity_algorithm:
      AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_ALGORITHM,
    evidence_candidate_authenticity_key_id:
      text(candidateMetadata.evidence_candidate_authenticity_key_id, 80) || null,
    evidence_candidate_authenticity_domain_separated_from_observation: true,
    mechanism_agenda_authenticity_required: true,
    mechanism_agenda_authenticity_contract:
      AVANTIQO_LEARNING_MECHANISM_AGENDA_AUTHENTICITY_CONTRACT,
    mechanism_agenda_authenticity_algorithm:
      AVANTIQO_LEARNING_MECHANISM_AGENDA_AUTHENTICITY_ALGORITHM,
    mechanism_agenda_authenticity_domain_separated_from_candidate: true,
    unsigned_candidate_compatibility_allowed: false,
  };

  const sealed = sealAvantiqoLearningMechanismAgendaAuthenticity(row);
  if (!sealed.success || !sealed.row) {
    throw new Error(
      `AVANTIQO_LEARNING_EVIDENCE_MECHANISM_AGENDA_AUTHENTICITY_REQUIRED:${sealed.reason || "UNKNOWN"}`,
    );
  }
  return sealed.row;
}

async function loadCandidates(organizationId) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,organization_id,party_id,entity_id,conversation_id,source_turn_id,memory_scope,memory_key,memory_type,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at")
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

async function loadVerifiedPersistedAgendaRows({ organizationId, agendaRows }) {
  if (!agendaRows.length) return [];
  const keys = agendaRows.map((row) => row.memory_key);
  const loaded = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,organization_id,party_id,entity_id,conversation_id,source_turn_id,memory_scope,memory_key,memory_type,subject,content,importance,confidence,source,active,valid_until,superseded_by,superseded_at,forgotten_at,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .in("memory_key", keys);
  if (loaded.error) throw loaded.error;
  const verifier = createAvantiqoLearningMechanismAgendaAuthenticityVerifier();
  const byKey = new Map(list(loaded.data).map((row) => [text(row.memory_key, 240), row]));
  return agendaRows.map((agenda) => {
    const persisted = byKey.get(text(agenda.memory_key, 240));
    if (!persisted || verifier.verify(persisted) !== true) {
      throw new Error("AVANTIQO_LEARNING_EVIDENCE_MECHANISM_AGENDA_PERSISTED_AUTHENTICITY_REQUIRED");
    }
    return persisted;
  });
}

async function compactBridgedCandidateProvenance({ organizationId, candidate, agenda, now }) {
  const metadata = object(candidate?.metadata);
  const nowIso = now.toISOString();
  const compactMetadata = {
    contract: text(metadata.contract, 180) || null,
    ingress_contract: text(metadata.ingress_contract, 180) || null,
    source_feedback_contract: text(metadata.source_feedback_contract, 180) || null,
    epistemic_state: "BRIDGED_TO_AUTHENTICATED_MECHANISM_AGENDA",
    candidate_fingerprint: text(metadata.candidate_fingerprint, 160) || null,
    code_mission_id: text(metadata.code_mission_id, 240) || null,
    code_mission_repository_head_verified:
      text(metadata.code_mission_repository_head_verified, 160) || null,
    topic_key: text(metadata.topic_key, 240) || null,
    knowledge_domain: text(metadata.knowledge_domain, 120) || null,
    source_count: Number(metadata.source_count || 0),
    evidence_candidate_memory_key: text(candidate?.memory_key, 240) || null,
    mechanism_agenda_memory_key: text(agenda?.memory_key, 240) || null,
    mechanism_agenda_fingerprint:
      text(object(agenda?.metadata).evidence_candidate_fingerprint, 160) || null,
    bridge_retention_state: "COMPACT_BRIDGED_PROVENANCE",
    reusable_platform_knowledge: false,
    knowledge_router_reuse_allowed: false,
    automatic_knowledge_promotion: false,
    raw_reasoning_persisted: false,
    authorization_value: "none",
    bridged_at: nowIso,
  };
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({
      active: false,
      superseded_by: text(agenda?.memory_key, 240) || null,
      superseded_at: nowIso,
      content: `Evidence candidate bridged to authenticated mechanism agenda ${text(agenda?.memory_key, 240)}.`,
      metadata: compactMetadata,
      updated_at: nowIso,
    })
    .eq("id", candidate.id)
    .eq("organization_id", organizationId)
    .eq("memory_scope", EVIDENCE_CANDIDATE_SCOPE)
    .eq("active", true)
    .select("id");
  if (result.error) throw result.error;
  return list(result.data).length;
}

async function trimRetiredCandidateProvenance(organizationId) {
  const overflow = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id")
    .eq("organization_id", organizationId)
    .eq("memory_scope", EVIDENCE_CANDIDATE_SCOPE)
    .eq("active", false)
    .eq("metadata->>bridge_retention_state", "COMPACT_BRIDGED_PROVENANCE")
    .order("updated_at", { ascending: false })
    .range(MAX_RETIRED_CANDIDATE_PROVENANCE, MAX_RETIRED_CANDIDATE_PROVENANCE + 99);
  if (overflow.error) throw overflow.error;
  const ids = list(overflow.data).map((row) => row.id).filter(Boolean);
  if (!ids.length) return 0;
  const deleted = await supabaseAdmin
    .from(MEMORY_TABLE)
    .delete()
    .eq("organization_id", organizationId)
    .eq("memory_scope", EVIDENCE_CANDIDATE_SCOPE)
    .in("id", ids)
    .select("id");
  if (deleted.error) throw deleted.error;
  return list(deleted.data).length;
}

function blockerCounts(entries) {
  const counts = {};
  for (const entry of entries) {
    for (const blocker of list(entry?.admission?.blockers)) {
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

  const verifier = createAvantiqoLearningEvidenceCandidateAuthenticityVerifier();
  const candidates = await loadCandidates(organizationId);
  const now = new Date();
  const assessments = candidates.map((candidate) => ({
    candidate,
    admission: assessAvantiqoLearningEvidenceCandidateBridgeEligibility(
      candidate,
      { now, authenticity_verifier: verifier },
    ),
  }));
  const eligible = assessments.filter((entry) => entry.admission.eligible);
  const rejected = assessments.filter((entry) => !entry.admission.eligible);
  const maximum = Math.max(
    1,
    Math.min(MAX_AGENDA_WRITES, Number(limit) || MAX_AGENDA_WRITES),
  );
  const agendaRows = eligible.slice(0, maximum).map(({ candidate }) =>
    buildAvantiqoLearningEvidenceMechanismAgendaRow({
      organizationId,
      candidate,
      now,
      authenticity_verifier: verifier,
    }),
  );
  const selectedEligible = eligible.slice(0, maximum);
  const writeCount = persist ? await upsertAgenda(agendaRows) : 0;
  const persistedAgendaRows = persist
    ? await loadVerifiedPersistedAgendaRows({ organizationId, agendaRows })
    : [];
  let compactedCandidateCount = 0;
  let trimmedCandidateProvenanceCount = 0;
  if (persist && persistedAgendaRows.length) {
    for (let index = 0; index < persistedAgendaRows.length; index += 1) {
      compactedCandidateCount += await compactBridgedCandidateProvenance({
        organizationId,
        candidate: selectedEligible[index].candidate,
        agenda: persistedAgendaRows[index],
        now,
      });
    }
    trimmedCandidateProvenanceCount = await trimRetiredCandidateProvenance(organizationId);
  }

  return {
    success: true,
    contract: AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_CONTRACT,
    status: eligible.length
      ? "AUTHENTICATED_EVIDENCE_CANDIDATES_BRIDGED_TO_MECHANISM_REVIEW"
      : candidates.length
        ? "EVIDENCE_CANDIDATES_REJECTED_BY_ADMISSION_GUARD"
        : "NO_EVIDENCE_CANDIDATES",
    reviewed_candidate_count: candidates.length,
    eligible_candidate_count: eligible.length,
    rejected_candidate_count: rejected.length,
    authenticated_candidate_count: eligible.length,
    unsigned_or_forged_candidate_count: rejected.filter((entry) =>
      entry.admission.blockers.includes("EVIDENCE_CANDIDATE_AUTHENTICITY_REQUIRED"),
    ).length,
    authenticity_configuration_available: verifier.available === true,
    rejection_blocker_counts: blockerCounts(rejected),
    mechanism_agenda_count: agendaRows.length,
    mechanism_agenda_write_count: writeCount,
    mechanism_agenda_authenticity_sealed_count: agendaRows.length,
    bridged_candidate_provenance_compacted_count: compactedCandidateCount,
    retired_candidate_provenance_trimmed_count: trimmedCandidateProvenanceCount,
    policy: {
      candidate_admission_fail_closed: true,
      evidence_candidate_authenticity_required: true,
      evidence_candidate_authenticity_domain_separated_from_observation: true,
      unsigned_candidate_compatibility_allowed: false,
      database_only_writer_cannot_reseal_evidence_candidate_without_server_key: true,
      mechanism_agenda_authenticity_required: true,
      mechanism_agenda_authenticity_domain_separated_from_candidate: true,
      database_only_writer_cannot_reseal_mechanism_agenda_without_server_key: true,
      candidate_is_not_reusable_knowledge: true,
      adversarial_mechanism_review_required: true,
      contradiction_search_required: true,
      boundary_condition_search_required: true,
      explicit_final_knowledge_promotion_required: true,
    },
    governance: {
      provider_free: true,
      model_call_performed: false,
      gpu_execution_performed: false,
      modal_job_submitted: false,
      automatic_knowledge_promotion: false,
      reusable_platform_knowledge_written: false,
      customer_private_content_promoted: false,
      raw_reasoning_persisted: false,
      business_action_executed: false,
      message_sent: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoLearningEvidenceCandidateBridgeRuntime = Object.freeze({
  contract: AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_CONTRACT,
  admission_contract: AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_ADMISSION_CONTRACT,
  mechanism_agenda_contract: AVANTIQO_LEARNING_EVIDENCE_MECHANISM_AGENDA_CONTRACT,
  evidence_candidate_authenticity_contract:
    AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_AUTHENTICITY_CONTRACT,
  mechanism_agenda_authenticity_contract:
    AVANTIQO_LEARNING_MECHANISM_AGENDA_AUTHENTICITY_CONTRACT,
  assessEligibility: assessAvantiqoLearningEvidenceCandidateBridgeEligibility,
  buildMechanismAgendaRow: buildAvantiqoLearningEvidenceMechanismAgendaRow,
  reconcile: reconcileAvantiqoLearningEvidenceCandidates,
  structural_core: CoreRuntime,
});

export default reconcileAvantiqoLearningEvidenceCandidates;
