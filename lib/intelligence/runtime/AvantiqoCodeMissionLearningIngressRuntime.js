import { createHash } from "node:crypto";
import {
  AVANTIQO_CODE_MISSION_LEARNING_FEEDBACK_CONTRACT,
} from "./AvantiqoIntelligenceCodeMissionRuntime.js";

export const AVANTIQO_CODE_MISSION_LEARNING_INGRESS_CONTRACT =
  "AVANTIQO_CODE_MISSION_LEARNING_INGRESS_V1";

const CONTINUOUS_LEARNING_EVIDENCE_CANDIDATE_CONTRACT =
  "AVANTIQO_CONTINUOUS_LEARNING_EVIDENCE_CANDIDATE_V1";
const MEMORY_TABLE = "intelligence_memories";
const EVIDENCE_CANDIDATE_SCOPE = "platform_learning_evidence_candidates";
const SOURCE = "verified_code_mission_learning_feedback";
const MAX_LIST = 80;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function strings(value, limit = MAX_LIST, itemLimit = 2000) {
  return [...new Set(
    list(value)
      .map((item) => text(item, itemLimit))
      .filter(Boolean),
  )].slice(0, limit);
}

function safeStructuralValue(value, depth = 0) {
  if (value === null || value === undefined) return null;
  if (depth > 4) return "[bounded]";
  if (["string", "number", "boolean"].includes(typeof value)) {
    return typeof value === "string" ? text(value, 3000) : value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 40)
      .map((entry) => safeStructuralValue(entry, depth + 1))
      .filter((entry) => entry !== null);
  }
  if (typeof value === "object") {
    const forbidden = /(password|secret|token|api[_-]?key|authorization|credential|cookie|stdout|stderr|raw[_-]?(payload|output|reasoning|content))/i;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !forbidden.test(key))
        .slice(0, 60)
        .map(([key, entry]) => [key, safeStructuralValue(entry, depth + 1)])
        .filter(([, entry]) => entry !== null),
    );
  }
  return null;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(...values) {
  return createHash("sha256")
    .update(values.map((value) => typeof value === "string" ? value : stableJson(value)).join("|"))
    .digest("hex");
}

function learningOrganizationId(explicit = null) {
  return text(
    explicit || process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID,
    160,
  );
}

function structuralVerification(value) {
  return list(value).slice(0, 40).map((entry) => {
    const source = object(entry);
    return {
      contract: text(source.contract, 180) || null,
      check: text(source.check || source.name || source.kind, 500) || null,
      command: text(source.command, 500) || null,
      args: strings(source.args, 24, 500),
      passed: source.passed === true,
      exit_code: Number.isInteger(source.exit_code) ? source.exit_code : null,
      status: text(source.status, 120) || null,
    };
  }).filter((entry) =>
    entry.contract || entry.check || entry.command || entry.status || entry.passed
  );
}

function evidenceClaim(feedback) {
  const candidate = object(feedback.candidate);
  const reusablePattern = text(candidate.reusable_implementation_pattern, 5000);
  const architecture = text(candidate.architecture_chosen, 5000);
  const repaired = list(candidate.failure_repair_relationships)
    .map((entry) => safeStructuralValue(entry))
    .filter(Boolean);
  const boundaries = strings(candidate.boundary_conditions, 12, 1200);
  const rejected = strings(candidate.approaches_that_did_not_work, 12, 1200);

  if (reusablePattern) {
    return `Verified Code mission evidence supports this implementation pattern under the recorded verification and boundary conditions: ${reusablePattern}`;
  }
  if (architecture) {
    return `Verified Code mission evidence supports this architecture choice under the recorded verification and boundary conditions: ${architecture}`;
  }
  if (repaired.length) {
    return `Verified Code mission evidence contains an observed failure-to-repair relationship that should be reviewed for reusable engineering knowledge: ${text(stableJson(repaired), 5000)}`;
  }
  if (boundaries.length || rejected.length) {
    return [
      "Verified Code mission evidence identifies implementation boundary conditions and rejected approaches that may be reusable after epistemic review.",
      boundaries.length ? `Boundary conditions: ${boundaries.join("; ")}.` : "",
      rejected.length ? `Approaches that did not work: ${rejected.join("; ")}.` : "",
    ].filter(Boolean).join(" ");
  }

  return `Verified Code mission ${text(feedback.mission_id, 240)} completed with deterministic verification evidence. Review its structural implementation evidence before any reusable-knowledge release.`;
}

function normalizedCandidate(feedback) {
  const candidate = object(feedback.candidate);
  return {
    architecture_chosen: text(candidate.architecture_chosen, 5000) || null,
    alternatives_rejected: strings(candidate.alternatives_rejected, 24, 1200),
    dependencies_discovered: strings(candidate.dependencies_discovered, 40, 1200),
    affected_domains: strings(candidate.affected_domains, 40, 300),
    affected_capabilities: strings(candidate.affected_capabilities, 80, 500),
    files_components_involved: strings(candidate.files_components_involved, 80, 1000),
    tests_that_mattered: strings(candidate.tests_that_mattered, 40, 1200),
    failure_repair_relationships: safeStructuralValue(candidate.failure_repair_relationships || []),
    cross_system_consequences: strings(candidate.cross_system_consequences, 40, 1600),
    reusable_implementation_pattern:
      text(candidate.reusable_implementation_pattern, 5000) || null,
    final_successful_verification:
      structuralVerification(candidate.final_successful_verification),
    boundary_conditions: strings(candidate.boundary_conditions, 40, 1600),
    approaches_that_did_not_work:
      strings(candidate.approaches_that_did_not_work, 40, 1600),
    repository_head_verified: text(candidate.repository_head_verified, 160) || null,
  };
}

function assertFeedbackContract(feedback) {
  const contract = text(feedback?.contract, 200);
  if (contract !== AVANTIQO_CODE_MISSION_LEARNING_FEEDBACK_CONTRACT) {
    throw new Error(
      `AVANTIQO_CODE_MISSION_LEARNING_INGRESS_FEEDBACK_CONTRACT_INVALID:${contract || "missing"}`,
    );
  }
}

function feedbackEligible(feedback) {
  return Boolean(
    feedback?.verified_result === true &&
    feedback?.eligible_for_learning_review === true &&
    text(feedback?.status, 120) === "LEARNING_EVIDENCE_CANDIDATE_READY" &&
    text(feedback?.epistemic_state, 120) === "EVIDENCE_CANDIDATE_NOT_RELEASED" &&
    feedback?.reusable_platform_knowledge !== true &&
    feedback?.knowledge_router_reuse_allowed !== true &&
    feedback?.automatic_knowledge_promotion !== true &&
    feedback?.candidate && typeof feedback.candidate === "object"
  );
}

export function buildAvantiqoCodeMissionLearningEvidenceCandidateRow({
  feedback,
  organization_id,
  now = new Date(),
} = {}) {
  assertFeedbackContract(feedback);
  if (!feedbackEligible(feedback)) return null;

  const organizationId = learningOrganizationId(organization_id);
  if (!organizationId) {
    throw new Error("AVANTIQO_CODE_MISSION_LEARNING_INGRESS_ORGANIZATION_REQUIRED");
  }
  const missionId = text(feedback.mission_id, 240);
  if (!missionId) {
    throw new Error("AVANTIQO_CODE_MISSION_LEARNING_INGRESS_MISSION_ID_REQUIRED");
  }
  const candidate = normalizedCandidate(feedback);
  const claim = evidenceClaim({ ...feedback, candidate });
  const repositoryHead = text(candidate.repository_head_verified, 160) || "unknown-head";
  const candidateFingerprint = digest(missionId, repositoryHead, claim, candidate);
  const topicKey = `code-mission-${candidateFingerprint.slice(0, 20)}`;
  const nowIso = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const knowledgeDomain = candidate.affected_domains.length === 1
    ? candidate.affected_domains[0]
    : "platform-engineering";

  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: EVIDENCE_CANDIDATE_SCOPE,
    memory_key: `code-mission-evidence-candidate:${candidateFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Verified Code mission evidence: ${missionId}`,
    content: claim,
    importance: 0.86,
    confidence: 1,
    source: SOURCE,
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: CONTINUOUS_LEARNING_EVIDENCE_CANDIDATE_CONTRACT,
      ingress_contract: AVANTIQO_CODE_MISSION_LEARNING_INGRESS_CONTRACT,
      source_feedback_contract: AVANTIQO_CODE_MISSION_LEARNING_FEEDBACK_CONTRACT,
      epistemic_state: "EVIDENCE_CANDIDATE_NOT_RELEASED",
      reusable_platform_knowledge: false,
      knowledge_router_reuse_allowed: false,
      automatic_knowledge_promotion: false,
      explicit_final_promotion_required: true,
      non_destructive_reconciliation: true,
      prior_released_knowledge_retired: false,
      requires_epistemic_promotion_pipeline: true,
      customer_private_memory: false,
      customer_private_content_included: false,
      raw_customer_turn_included: false,
      raw_payload_included: false,
      raw_output_included: false,
      raw_reasoning_persisted: false,
      knowledge_domain: knowledgeDomain,
      jurisdiction: null,
      topic_key: topicKey,
      stability: "mutable",
      code_mission_id: missionId,
      code_mission_repository_head_verified:
        candidate.repository_head_verified || null,
      candidate_fingerprint: candidateFingerprint,
      source_count: candidate.final_successful_verification.length,
      verified_execution_evidence_present:
        candidate.final_successful_verification.length > 0,
      structural_code_learning_candidate: candidate,
      next_stage_contract: "AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_V1",
      direct_platform_knowledge_write_allowed: false,
      automatic_training_effect: "NONE",
      automatic_model_weight_mutation: false,
      production_model_promotion_effect: "NONE",
      automatic_runpod_submission: false,
      authorization_value: "none",
      created_by: SOURCE,
      observed_at: nowIso,
      updated_at: nowIso,
    },
    updated_at: nowIso,
  };
}

async function resolveSupabaseAdmin() {
  const module = await import("../../shared/supabase/admin.js");
  return module.supabaseAdmin;
}

export async function ingestAvantiqoCodeMissionLearningFeedback({
  feedback,
  organization_id = null,
  database = null,
} = {}) {
  assertFeedbackContract(feedback);
  if (!feedbackEligible(feedback)) {
    return {
      success: true,
      contract: AVANTIQO_CODE_MISSION_LEARNING_INGRESS_CONTRACT,
      status: "NOT_ELIGIBLE_UNVERIFIED_RESULT",
      written: false,
      evidence_candidate_written: false,
      reusable_platform_knowledge_written: false,
      reason: "VERIFIED_CODE_RESULT_REQUIRED",
      governance: {
        provider_free: true,
        model_call_performed: false,
        runpod_job_submitted: false,
        automatic_knowledge_promotion: false,
        direct_platform_knowledge_write_allowed: false,
      },
    };
  }

  const organizationId = learningOrganizationId(organization_id);
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_CODE_MISSION_LEARNING_INGRESS_CONTRACT,
      status: "DISABLED",
      written: false,
      evidence_candidate_written: false,
      reusable_platform_knowledge_written: false,
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
    };
  }

  const row = buildAvantiqoCodeMissionLearningEvidenceCandidateRow({
    feedback,
    organization_id: organizationId,
  });
  const client = database || await resolveSupabaseAdmin();
  const result = await client
    .from(MEMORY_TABLE)
    .upsert(row, {
      onConflict: "organization_id,memory_scope,memory_key",
    })
    .select("id,memory_key,subject,metadata,created_at,updated_at")
    .single();
  if (result.error) throw result.error;

  return {
    success: true,
    contract: AVANTIQO_CODE_MISSION_LEARNING_INGRESS_CONTRACT,
    status: "EVIDENCE_CANDIDATE_INGESTED",
    written: Boolean(result.data?.id),
    evidence_candidate_written: Boolean(result.data?.id),
    reusable_platform_knowledge_written: false,
    memory_scope: EVIDENCE_CANDIDATE_SCOPE,
    memory_key: row.memory_key,
    next_stage_contract: "AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_V1",
    governance: {
      provider_free: true,
      model_call_performed: false,
      research_performed: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      automatic_knowledge_promotion: false,
      direct_platform_knowledge_write_allowed: false,
      customer_private_content_promoted: false,
      raw_reasoning_persisted: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoCodeMissionLearningIngressRuntime = Object.freeze({
  contract: AVANTIQO_CODE_MISSION_LEARNING_INGRESS_CONTRACT,
  evidence_candidate_contract: CONTINUOUS_LEARNING_EVIDENCE_CANDIDATE_CONTRACT,
  evidence_candidate_scope: EVIDENCE_CANDIDATE_SCOPE,
  buildRow: buildAvantiqoCodeMissionLearningEvidenceCandidateRow,
  ingest: ingestAvantiqoCodeMissionLearningFeedback,
});

export default AvantiqoCodeMissionLearningIngressRuntime;
