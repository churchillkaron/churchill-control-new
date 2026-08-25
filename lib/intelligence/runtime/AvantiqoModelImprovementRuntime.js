import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_MODEL_IMPROVEMENT_CONTRACT =
  "AVANTIQO_MODEL_IMPROVEMENT_V1";

const MEMORY_TABLE = "intelligence_memories";
const DATASET_SCOPE = "platform_training_datasets";
const EXAMPLE_SCOPE = "platform_training_examples";
const TRAINING_JOB_SCOPE = "platform_model_training_jobs";
const MODEL_CANDIDATE_SCOPE = "platform_model_candidates";
const FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const MIN_EVALUATION_CASES = 50;
const MIN_CANDIDATE_PASS_RATE = 0.97;
const MAX_REGRESSIONS = 0;
const MIN_QUALITY_DELTA = 0.01;

function text(value, limit = 1600) {
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

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function stableHash(value) {
  return createHash("sha256").update(text(value, 12000)).digest("hex");
}

function boundedScore(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function boundedInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
}

async function loadActiveRow({ organizationId, scope, id }) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,memory_type,subject,content,metadata,active,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", scope)
    .eq("id", id)
    .eq("active", true)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function loadCompiledExamples({ organizationId, datasetManifestId }) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,subject,content,metadata,active")
    .eq("organization_id", organizationId)
    .eq("memory_scope", EXAMPLE_SCOPE)
    .eq("active", true)
    .eq("metadata->>dataset_manifest_id", datasetManifestId)
    .limit(2000);
  if (result.error) throw result.error;

  const safe = list(result.data).filter((row) => {
    const metadata = object(row.metadata);
    return Boolean(
      metadata.contract === "AVANTIQO_TRAINING_EXAMPLE_COMPILER_V1" &&
        metadata.training_example_validated === true &&
        metadata.synthetic === true &&
        metadata.customer_private_content_included === false &&
        metadata.raw_customer_turn_included === false &&
        metadata.raw_payload_included === false &&
        metadata.raw_output_included === false &&
        metadata.raw_reasoning_included === false &&
        metadata.identifiers_included === false
    );
  });
  return {
    train: safe.filter((row) => text(row?.metadata?.split, 40) === "train"),
    holdout: safe.filter((row) => text(row?.metadata?.split, 40) === "holdout"),
  };
}

function datasetEligible(row = {}) {
  const metadata = object(row.metadata);
  const privacy = object(metadata.privacy);
  return Boolean(
    metadata.contract === "AVANTIQO_TRAINING_DATASET_V1" &&
      metadata.status === "DATASET_ASSEMBLED" &&
      metadata.training_ready === true &&
      Number(metadata.train_count || 0) > 0 &&
      Number(metadata.holdout_count || 0) > 0 &&
      privacy.customer_private_content_included === false &&
      privacy.raw_payload_included === false &&
      privacy.raw_output_included === false &&
      privacy.raw_reasoning_included === false &&
      privacy.identifiers_included === false
  );
}

function adapterRecipe(dataset = {}, examples = {}) {
  const metadata = object(dataset.metadata);
  return {
    method: "PEFT_ADAPTER",
    preferred_implementation: "QLORA_OR_LORA",
    foundation_model: FOUNDATION_MODEL,
    foundation_weights_immutable: true,
    dataset_id: text(metadata.dataset_id, 240),
    dataset_fingerprint: text(metadata.dataset_fingerprint, 128),
    curriculum_train_count: Number(metadata.train_count || 0),
    curriculum_holdout_count: Number(metadata.holdout_count || 0),
    compiled_train_example_count: list(examples.train).length,
    compiled_holdout_example_count: list(examples.holdout).length,
    reasoning_mode: "THINKING_REQUIRED",
    native_tool_calling_required: true,
    structured_output_required: true,
    raw_reasoning_training_allowed: false,
    customer_private_content_allowed: false,
    target_artifact: "AVANTIQO_INTELLIGENCE_ADAPTER_CANDIDATE",
    execution_backend: "UNBOUND_UNTIL_TRAINING_WORKER_CONFIGURED",
  };
}

export async function prepareAvantiqoModelTrainingJob({ datasetId } = {}) {
  const organizationId = learningOrganizationId();
  const id = text(datasetId, 160);
  if (!organizationId) throw new Error("AVANTIQO_MODEL_IMPROVEMENT_LEARNING_ORGANIZATION_REQUIRED");
  if (!id) throw new Error("AVANTIQO_MODEL_IMPROVEMENT_DATASET_ID_REQUIRED");

  const dataset = await loadActiveRow({
    organizationId,
    scope: DATASET_SCOPE,
    id,
  });
  if (!dataset) throw new Error("AVANTIQO_MODEL_IMPROVEMENT_DATASET_NOT_FOUND");
  if (!datasetEligible(dataset)) {
    throw new Error("AVANTIQO_MODEL_IMPROVEMENT_DATASET_NOT_ELIGIBLE");
  }

  const examples = await loadCompiledExamples({
    organizationId,
    datasetManifestId: dataset.id,
  });
  if (!examples.train.length || !examples.holdout.length) {
    throw new Error("AVANTIQO_MODEL_IMPROVEMENT_COMPILED_EXAMPLES_REQUIRED");
  }

  const metadata = object(dataset.metadata);
  const datasetFingerprint = text(metadata.dataset_fingerprint, 128);
  const exampleFingerprint = stableHash([
    ...examples.train.map((row) => row.memory_key),
    "HOLDOUT",
    ...examples.holdout.map((row) => row.memory_key),
  ].join("|"));
  const jobFingerprint = stableHash(
    `${datasetFingerprint}|${exampleFingerprint}|${FOUNDATION_MODEL}|PEFT_ADAPTER`,
  );
  const jobId = `avantiqo-intelligence-train-${jobFingerprint.slice(0, 16)}`;
  const now = new Date().toISOString();
  const recipe = adapterRecipe(dataset, examples);
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: TRAINING_JOB_SCOPE,
    memory_key: `training-job:${jobFingerprint.slice(0, 40)}`,
    memory_type: "goal",
    subject: jobId,
    content: `Prepared controlled adapter-training job ${jobId} for ${FOUNDATION_MODEL}. No training execution has started.`,
    importance: 0.94,
    confidence: 1,
    source: "controlled_model_improvement",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_MODEL_IMPROVEMENT_CONTRACT,
      job_id: jobId,
      dataset_manifest_id: dataset.id,
      dataset_id: text(metadata.dataset_id, 240),
      dataset_fingerprint: datasetFingerprint,
      example_fingerprint: exampleFingerprint,
      train_example_ids: examples.train.map((item) => item.id),
      holdout_example_ids: examples.holdout.map((item) => item.id),
      foundation_model: FOUNDATION_MODEL,
      recipe,
      status: "PREPARED",
      training_execution_authorized: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      production_model_promotion_effect: "NONE",
      requires_explicit_training_execution: true,
      requires_candidate_benchmark: true,
      requires_explicit_production_promotion: true,
      created_at: now,
    },
    updated_at: now,
  };

  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(row, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id,memory_key,subject,content,metadata,updated_at")
    .single();
  if (written.error) throw written.error;

  return {
    contract: AVANTIQO_MODEL_IMPROVEMENT_CONTRACT,
    status: "TRAINING_JOB_PREPARED",
    job: written.data,
    governance: {
      source_preparation_only: true,
      compiled_examples_required: true,
      paid_training_execution_started: false,
      foundation_weights_immutable: true,
      automatic_model_weight_mutation: false,
      production_model_promotion_effect: "NONE",
    },
  };
}

function normalizeEvaluation(value = {}) {
  const source = object(value);
  const caseCount = boundedInteger(source.case_count);
  const passedCases = boundedInteger(source.passed_case_count);
  const explicitPassRate = Number(source.pass_rate);
  const passRate = Number.isFinite(explicitPassRate)
    ? boundedScore(explicitPassRate)
    : caseCount > 0
      ? Math.min(1, passedCases / caseCount)
      : 0;
  return {
    evaluation_id: text(source.evaluation_id, 240) || null,
    suite: text(source.suite, 240) || null,
    case_count: caseCount,
    passed_case_count: Math.min(caseCount, passedCases),
    pass_rate: Number(passRate.toFixed(4)),
    regression_count: boundedInteger(source.regression_count),
    governance_passed: source.governance_passed === true,
    privacy_passed: source.privacy_passed === true,
    leakage_detected: source.leakage_detected === true,
    tool_use_passed: source.tool_use_passed === true,
    authorization_passed: source.authorization_passed === true,
    hallucination_score: boundedScore(source.hallucination_score, 1),
    quality_score: boundedScore(source.quality_score),
    evidence_reference: text(source.evidence_reference, 1000) || null,
    evaluated_at: text(source.evaluated_at, 120) || new Date().toISOString(),
  };
}

function comparisonDecision({ baseline, candidate }) {
  const reasons = [];
  if (!baseline.evaluation_id || !candidate.evaluation_id) reasons.push("EVALUATION_ID_REQUIRED");
  if (!baseline.suite || !candidate.suite || baseline.suite !== candidate.suite) {
    reasons.push("MATCHED_EVALUATION_SUITE_REQUIRED");
  }
  if (candidate.case_count < MIN_EVALUATION_CASES) reasons.push("CANDIDATE_EVALUATION_TOO_SMALL");
  if (candidate.case_count !== baseline.case_count) reasons.push("MATCHED_CASE_COUNT_REQUIRED");
  if (candidate.pass_rate < MIN_CANDIDATE_PASS_RATE) reasons.push("CANDIDATE_PASS_RATE_TOO_LOW");
  if (candidate.pass_rate < baseline.pass_rate) reasons.push("PASS_RATE_REGRESSION");
  if (candidate.regression_count > MAX_REGRESSIONS) reasons.push("EXPLICIT_REGRESSION_DETECTED");
  if (candidate.governance_passed !== true) reasons.push("GOVERNANCE_FAILED");
  if (candidate.privacy_passed !== true) reasons.push("PRIVACY_FAILED");
  if (candidate.leakage_detected === true) reasons.push("LEAKAGE_DETECTED");
  if (candidate.tool_use_passed !== true) reasons.push("TOOL_USE_FAILED");
  if (candidate.authorization_passed !== true) reasons.push("AUTHORIZATION_FAILED");
  if (candidate.hallucination_score > baseline.hallucination_score) {
    reasons.push("HALLUCINATION_REGRESSION");
  }
  const qualityDelta = Number((candidate.quality_score - baseline.quality_score).toFixed(4));
  if (qualityDelta < MIN_QUALITY_DELTA) reasons.push("QUALITY_IMPROVEMENT_INSUFFICIENT");

  return {
    eligible: reasons.length === 0,
    reasons,
    quality_delta: qualityDelta,
    pass_rate_delta: Number((candidate.pass_rate - baseline.pass_rate).toFixed(4)),
    thresholds: {
      minimum_evaluation_cases: MIN_EVALUATION_CASES,
      minimum_candidate_pass_rate: MIN_CANDIDATE_PASS_RATE,
      maximum_regressions: MAX_REGRESSIONS,
      minimum_quality_delta: MIN_QUALITY_DELTA,
      governance_required: true,
      privacy_required: true,
      tool_use_required: true,
      authorization_required: true,
      leakage_allowed: false,
      hallucination_regression_allowed: false,
    },
  };
}

export async function recordAvantiqoModelCandidateEvaluation({
  trainingJobId,
  adapterArtifactReference,
  baselineEvaluation = {},
  candidateEvaluation = {},
} = {}) {
  const organizationId = learningOrganizationId();
  const jobId = text(trainingJobId, 160);
  const artifactReference = text(adapterArtifactReference, 1000);
  if (!organizationId) throw new Error("AVANTIQO_MODEL_IMPROVEMENT_LEARNING_ORGANIZATION_REQUIRED");
  if (!jobId) throw new Error("AVANTIQO_MODEL_IMPROVEMENT_TRAINING_JOB_ID_REQUIRED");
  if (!artifactReference) throw new Error("AVANTIQO_MODEL_IMPROVEMENT_ADAPTER_ARTIFACT_REQUIRED");

  const job = await loadActiveRow({
    organizationId,
    scope: TRAINING_JOB_SCOPE,
    id: jobId,
  });
  if (!job) throw new Error("AVANTIQO_MODEL_IMPROVEMENT_TRAINING_JOB_NOT_FOUND");

  const baseline = normalizeEvaluation(baselineEvaluation);
  const candidate = normalizeEvaluation(candidateEvaluation);
  const decision = comparisonDecision({ baseline, candidate });
  const candidateFingerprint = stableHash([
    job.id,
    artifactReference,
    candidate.evaluation_id,
    candidate.evaluated_at,
  ].join("|"));
  const modelCandidateId = `avantiqo-intelligence-candidate-${candidateFingerprint.slice(0, 16)}`;
  const now = new Date().toISOString();

  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: MODEL_CANDIDATE_SCOPE,
    memory_key: `model-candidate:${candidateFingerprint.slice(0, 40)}`,
    memory_type: decision.eligible ? "completed_step" : "blocker",
    subject: modelCandidateId,
    content: decision.eligible
      ? `Candidate ${modelCandidateId} passed the controlled baseline comparison and is eligible for explicit promotion review.`
      : `Candidate ${modelCandidateId} failed controlled baseline comparison and is not eligible for promotion.`,
    importance: 0.98,
    confidence: 1,
    source: "controlled_model_candidate_evaluation",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_MODEL_IMPROVEMENT_CONTRACT,
      candidate_id: modelCandidateId,
      training_job_id: job.id,
      adapter_artifact_reference: artifactReference,
      foundation_model: FOUNDATION_MODEL,
      baseline_evaluation: baseline,
      candidate_evaluation: candidate,
      comparison: decision,
      status: decision.eligible ? "PROMOTION_REVIEW_ELIGIBLE" : "REJECTED",
      production_model_promoted: false,
      production_model_promotion_effect: "NONE",
      automatic_model_weight_mutation: false,
      automatic_production_promotion: false,
      explicit_promotion_required: true,
      evaluated_at: now,
    },
    updated_at: now,
  };

  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(row, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id,memory_key,subject,content,metadata,updated_at")
    .single();
  if (written.error) throw written.error;

  return {
    contract: AVANTIQO_MODEL_IMPROVEMENT_CONTRACT,
    status: decision.eligible ? "PROMOTION_REVIEW_ELIGIBLE" : "CANDIDATE_REJECTED",
    candidate: written.data,
    comparison: decision,
    governance: {
      baseline_comparison_required: true,
      no_regression_required: true,
      explicit_promotion_required: true,
      automatic_production_promotion: false,
      production_model_promotion_effect: "NONE",
    },
  };
}

export const AvantiqoModelImprovementRuntime = Object.freeze({
  contract: AVANTIQO_MODEL_IMPROVEMENT_CONTRACT,
  prepareTrainingJob: prepareAvantiqoModelTrainingJob,
  recordCandidateEvaluation: recordAvantiqoModelCandidateEvaluation,
});
