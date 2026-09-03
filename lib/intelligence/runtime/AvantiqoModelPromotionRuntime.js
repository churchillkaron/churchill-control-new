import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  requireAvantiqoBehavioralTraceCertification,
} from "./AvantiqoBehavioralTraceBenchmarkRuntime.mjs";
import {
  certifyAvantiqoModelCandidateCanary,
} from "./AvantiqoModelCandidateCanaryRuntime";

export const AVANTIQO_MODEL_PROMOTION_CONTRACT =
  "AVANTIQO_MODEL_PROMOTION_V1";

const MEMORY_TABLE = "intelligence_memories";
const MODEL_CANDIDATE_SCOPE = "platform_model_candidates";
const PROMOTION_REVIEW_SCOPE = "platform_model_promotion_reviews";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

async function loadCandidate(organizationId, id) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,subject,content,metadata,active,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", MODEL_CANDIDATE_SCOPE)
    .eq("id", id)
    .eq("active", true)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

function benchmarkEligible(candidate = {}) {
  const metadata = object(candidate.metadata);
  const comparison = object(metadata.comparison);
  const candidateEvaluation = object(metadata.candidate_evaluation);
  return Boolean(
    metadata.contract === "AVANTIQO_MODEL_IMPROVEMENT_V1" &&
      metadata.status === "PROMOTION_REVIEW_ELIGIBLE" &&
      comparison.eligible === true &&
      Number(comparison.quality_delta || 0) >= 0.01 &&
      Number(candidateEvaluation.case_count || 0) >= 50 &&
      Number(candidateEvaluation.regression_count || 0) === 0 &&
      candidateEvaluation.governance_passed === true &&
      candidateEvaluation.privacy_passed === true &&
      candidateEvaluation.tool_use_passed === true &&
      candidateEvaluation.authorization_passed === true &&
      candidateEvaluation.leakage_detected === false &&
      metadata.production_model_promoted === false
  );
}

async function persistReview({ organizationId, candidate, behavioralTrace, canary }) {
  const now = new Date().toISOString();
  const candidateMetadata = object(candidate.metadata);
  const reviewKey = `promotion-review:${candidate.id}`;
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: PROMOTION_REVIEW_SCOPE,
    memory_key: reviewKey,
    memory_type: "completed_step",
    subject: candidate.id,
    content: `Model candidate ${candidate.id} passed offline benchmark, repeated behavioral trace certification and isolated canary certification. Production release remains explicitly pending.`,
    importance: 0.99,
    confidence: 1,
    source: "controlled_model_promotion_review",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_MODEL_PROMOTION_CONTRACT,
      model_candidate_id: candidate.id,
      model_candidate_name: candidate.subject || null,
      adapter_artifact_reference: text(candidateMetadata.adapter_artifact_reference, 1000),
      benchmark_comparison: object(candidateMetadata.comparison),
      candidate_evaluation: object(candidateMetadata.candidate_evaluation),
      behavioral_trace_certification: behavioralTrace,
      canary,
      status: "CANARY_CERTIFIED_RELEASE_PENDING",
      release_ready: true,
      explicit_production_release_required: true,
      production_release_authorized: false,
      production_model_promoted: false,
      automatic_production_promotion: false,
      production_endpoint_mutated: false,
      rollback_required_before_release: false,
      created_at: now,
    },
    updated_at: now,
  };
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(row, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id,subject,content,metadata,updated_at")
    .single();
  if (result.error) throw result.error;
  return result.data;
}

export async function prepareAvantiqoModelPromotionReview({
  modelCandidateId,
  approved = false,
} = {}) {
  const organizationId = learningOrganizationId();
  const id = text(modelCandidateId, 160);
  if (!organizationId) throw new Error("AVANTIQO_MODEL_PROMOTION_LEARNING_ORGANIZATION_REQUIRED");
  if (!id) throw new Error("AVANTIQO_MODEL_PROMOTION_CANDIDATE_REQUIRED");
  if (approved !== true) throw new Error("AVANTIQO_MODEL_PROMOTION_EXPLICIT_CANARY_APPROVAL_REQUIRED");

  const candidate = await loadCandidate(organizationId, id);
  if (!candidate) throw new Error("AVANTIQO_MODEL_PROMOTION_CANDIDATE_NOT_FOUND");
  if (!benchmarkEligible(candidate)) {
    throw new Error("AVANTIQO_MODEL_PROMOTION_BENCHMARK_GATE_NOT_SATISFIED");
  }

  const candidateMetadata = object(candidate.metadata);
  const behavioralTrace = await requireAvantiqoBehavioralTraceCertification({
    modelCandidateId: candidate.id,
    adapterArtifactReference: text(candidateMetadata.adapter_artifact_reference, 1000),
  });
  if (
    behavioralTrace.status !== "BEHAVIORAL_TRACE_CERTIFIED" ||
    behavioralTrace?.comparison?.eligible !== true ||
    behavioralTrace?.governance?.attested_source_evidence_required !== true ||
    behavioralTrace?.governance?.attested_source_evidence_verified !== true ||
    behavioralTrace?.governance?.structured_operational_trace_only !== true ||
    behavioralTrace?.governance?.raw_traces_persisted !== false ||
    behavioralTrace?.governance?.raw_reasoning_persisted !== false ||
    behavioralTrace?.governance?.chain_of_thought_required !== false
  ) {
    throw new Error("AVANTIQO_MODEL_PROMOTION_BEHAVIORAL_TRACE_GATE_FAILED");
  }

  const canary = await certifyAvantiqoModelCandidateCanary({
    modelCandidateId: candidate.id,
    approved: true,
  });
  if (
    canary.status !== "CANARY_READY" ||
    canary?.certification?.endpoint_candidate_id_binding_verified !== true ||
    canary?.certification?.exact_adapter_artifact_binding_verified !== true ||
    canary?.certification?.structured_output_ok !== true ||
    canary?.certification?.native_tool_call_ok !== true
  ) {
    throw new Error("AVANTIQO_MODEL_PROMOTION_CANARY_GATE_FAILED");
  }

  const review = await persistReview({
    organizationId,
    candidate,
    behavioralTrace,
    canary,
  });

  return {
    contract: AVANTIQO_MODEL_PROMOTION_CONTRACT,
    status: "CANARY_CERTIFIED_RELEASE_PENDING",
    review,
    governance: {
      offline_benchmark_required: true,
      behavioral_trace_benchmark_required: true,
      attested_behavioral_trace_evidence_required: true,
      repeated_behavioral_runs_required: true,
      structured_operational_trace_only: true,
      raw_reasoning_required: false,
      isolated_canary_required: true,
      exact_adapter_binding_required: true,
      explicit_production_release_required: true,
      production_release_authorized: false,
      production_endpoint_mutated: false,
      production_model_promoted: false,
      automatic_production_promotion: false,
      production_model_promotion_effect: "NONE",
    },
  };
}

export const AvantiqoModelPromotionRuntime = Object.freeze({
  contract: AVANTIQO_MODEL_PROMOTION_CONTRACT,
  prepareReview: prepareAvantiqoModelPromotionReview,
});
