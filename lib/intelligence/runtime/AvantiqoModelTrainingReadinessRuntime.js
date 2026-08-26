import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_MODEL_TRAINING_READINESS_CONTRACT =
  "AVANTIQO_MODEL_TRAINING_READINESS_V1";

const MEMORY_TABLE = "intelligence_memories";
const DATASET_SCOPE = "platform_training_datasets";
const CANDIDATE_SCOPE = "platform_training_candidates";
const EXAMPLE_SCOPE = "platform_training_examples";
const TRAINING_JOB_SCOPE = "platform_model_training_jobs";
const FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const DATASET_CONTRACT = "AVANTIQO_TRAINING_DATASET_V1";
const CANDIDATE_CONTRACT = "AVANTIQO_CANONICAL_CURRICULUM_CANDIDATE_V1";
const EXAMPLE_CONTRACT = "AVANTIQO_TRAINING_EXAMPLE_COMPILER_V1";
const JOB_CONTRACT = "AVANTIQO_MODEL_IMPROVEMENT_V1";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function stableHash(value) {
  return createHash("sha256").update(text(value, 30000)).digest("hex");
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function candidateFingerprint(candidate = {}) {
  const metadata = object(candidate.metadata);
  return stableHash([
    metadata.candidate_kind,
    metadata.contract,
    metadata.capability_key || candidate.subject,
    metadata.outcome,
    metadata.verification_mode,
    metadata.source_fingerprint,
    metadata?.benchmark?.benchmark_id,
    metadata?.benchmark?.benchmark_suite,
    ...list(metadata.failure_family).slice().sort(),
  ].join("|"));
}

async function loadOne({ organizationId, scope, id }) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,subject,content,metadata,active,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", scope)
    .eq("id", id)
    .eq("active", true)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function loadMany({ organizationId, scope, ids }) {
  if (!ids.length) return [];
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,subject,content,metadata,active,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", scope)
    .eq("active", true)
    .in("id", ids);
  if (result.error) throw result.error;
  return list(result.data);
}

function assertDataset(dataset, jobMetadata) {
  if (!dataset) throw new Error("AVANTIQO_MODEL_TRAINING_READINESS_DATASET_NOT_FOUND");
  const metadata = object(dataset.metadata);
  if (
    metadata.contract !== DATASET_CONTRACT ||
    metadata.status !== "DATASET_ASSEMBLED" ||
    metadata.training_ready !== true ||
    metadata.source_version_bound !== true ||
    metadata.benchmark_version_bound !== true
  ) {
    throw new Error("AVANTIQO_MODEL_TRAINING_READINESS_DATASET_NOT_CURRENT");
  }
  if (
    text(metadata.dataset_fingerprint, 128) !==
    text(jobMetadata.dataset_fingerprint, 128)
  ) {
    throw new Error("AVANTIQO_MODEL_TRAINING_READINESS_DATASET_FINGERPRINT_MISMATCH");
  }
  return metadata;
}

function assertCandidates(datasetMetadata, candidates) {
  const candidateIds = list(datasetMetadata.candidate_ids)
    .map((item) => text(item, 160))
    .filter(Boolean);
  if (candidates.length !== candidateIds.length) {
    throw new Error(
      `AVANTIQO_MODEL_TRAINING_READINESS_CANDIDATE_COUNT_MISMATCH:${candidates.length}:${candidateIds.length}`,
    );
  }
  const byId = new Map(candidates.map((row) => [text(row.id, 160), row]));
  const bindings = new Map(
    list(datasetMetadata.candidate_bindings).map((binding) => [
      text(binding?.candidate_id, 160),
      object(binding),
    ]),
  );
  if (bindings.size !== candidateIds.length) {
    throw new Error("AVANTIQO_MODEL_TRAINING_READINESS_CANDIDATE_BINDINGS_INCOMPLETE");
  }

  for (const candidateId of candidateIds) {
    const candidate = byId.get(candidateId);
    const metadata = object(candidate?.metadata);
    const binding = bindings.get(candidateId);
    const fingerprint = candidateFingerprint(candidate);
    const unitId = `unit-${fingerprint.slice(0, 20)}`;
    if (
      metadata.contract !== CANDIDATE_CONTRACT ||
      metadata.candidate_kind !== "CANONICAL_PRODUCT_GROUNDING" ||
      metadata.training_ready !== true ||
      metadata.benchmark_status !== "APPROVED" ||
      metadata.customer_private_content_included !== false ||
      metadata.raw_payload_persisted !== false ||
      metadata.raw_output_persisted !== false ||
      metadata.raw_reasoning_persisted !== false ||
      metadata.identifiers_persisted !== false ||
      !binding ||
      text(binding.unit_id, 160) !== unitId ||
      text(binding.curriculum_fingerprint, 128) !== fingerprint ||
      text(binding.source_candidate_fingerprint, 128) !== text(metadata.source_fingerprint, 128) ||
      text(binding.source_benchmark_id, 240) !== text(metadata?.benchmark?.benchmark_id, 240) ||
      text(binding.source_benchmark_suite, 240) !== text(metadata?.benchmark?.benchmark_suite, 240)
    ) {
      throw new Error(
        `AVANTIQO_MODEL_TRAINING_READINESS_CANDIDATE_STALE:${candidateId}`,
      );
    }
  }

  return { candidateIds, byId };
}

function assertExampleRow({ row, jobMetadata, candidatesById }) {
  const metadata = object(row?.metadata);
  const candidate = candidatesById.get(text(metadata.source_candidate_id, 160));
  const candidateMetadata = object(candidate?.metadata);
  if (
    metadata.contract !== EXAMPLE_CONTRACT ||
    metadata.training_example_validated !== true ||
    metadata.synthetic !== true ||
    metadata.customer_private_content_included !== false ||
    metadata.raw_customer_turn_included !== false ||
    metadata.raw_payload_included !== false ||
    metadata.raw_output_included !== false ||
    metadata.raw_reasoning_included !== false ||
    metadata.identifiers_included !== false ||
    metadata.source_version_bound !== true ||
    metadata.benchmark_version_bound !== true ||
    text(metadata.dataset_manifest_id, 160) !== text(jobMetadata.dataset_manifest_id, 160) ||
    text(metadata.dataset_fingerprint, 128) !== text(jobMetadata.dataset_fingerprint, 128) ||
    !candidate ||
    text(metadata.source_candidate_fingerprint, 128) !== text(candidateMetadata.source_fingerprint, 128) ||
    text(metadata.source_benchmark_id, 240) !== text(candidateMetadata?.benchmark?.benchmark_id, 240) ||
    text(metadata.source_benchmark_suite, 240) !== text(candidateMetadata?.benchmark?.benchmark_suite, 240)
  ) {
    throw new Error(
      `AVANTIQO_MODEL_TRAINING_READINESS_EXAMPLE_STALE:${text(row?.id, 160) || "UNKNOWN"}`,
    );
  }
}

function assertExamples({ jobMetadata, examples, candidatesById }) {
  const trainIds = list(jobMetadata.train_example_ids)
    .map((item) => text(item, 160))
    .filter(Boolean);
  const holdoutIds = list(jobMetadata.holdout_example_ids)
    .map((item) => text(item, 160))
    .filter(Boolean);
  const allIds = [...new Set([...trainIds, ...holdoutIds])];
  if (
    !trainIds.length ||
    !holdoutIds.length ||
    allIds.length !== trainIds.length + holdoutIds.length ||
    examples.length !== allIds.length
  ) {
    throw new Error("AVANTIQO_MODEL_TRAINING_READINESS_EXAMPLE_SET_INCOMPLETE");
  }

  const byId = new Map(examples.map((row) => [text(row.id, 160), row]));
  for (const id of allIds) {
    const row = byId.get(id);
    if (!row) {
      throw new Error(`AVANTIQO_MODEL_TRAINING_READINESS_EXAMPLE_MISSING:${id}`);
    }
    assertExampleRow({ row, jobMetadata, candidatesById });
  }

  const fingerprint = stableHash([
    ...trainIds.map((id) => text(byId.get(id)?.memory_key, 240)),
    "HOLDOUT",
    ...holdoutIds.map((id) => text(byId.get(id)?.memory_key, 240)),
  ].join("|"));
  if (fingerprint !== text(jobMetadata.example_fingerprint, 128)) {
    throw new Error("AVANTIQO_MODEL_TRAINING_READINESS_EXAMPLE_FINGERPRINT_MISMATCH");
  }

  return {
    train_example_count: trainIds.length,
    holdout_example_count: holdoutIds.length,
    example_count: allIds.length,
    example_fingerprint: fingerprint,
  };
}

export async function certifyAvantiqoModelTrainingReadiness({
  trainingJobId,
} = {}) {
  const organizationId = learningOrganizationId();
  const jobId = text(trainingJobId, 160);
  if (!organizationId) {
    throw new Error("AVANTIQO_MODEL_TRAINING_READINESS_LEARNING_ORGANIZATION_REQUIRED");
  }
  if (!jobId) {
    throw new Error("AVANTIQO_MODEL_TRAINING_READINESS_JOB_REQUIRED");
  }

  const job = await loadOne({
    organizationId,
    scope: TRAINING_JOB_SCOPE,
    id: jobId,
  });
  if (!job) throw new Error("AVANTIQO_MODEL_TRAINING_READINESS_JOB_NOT_FOUND");
  const jobMetadata = object(job.metadata);
  if (
    jobMetadata.contract !== JOB_CONTRACT ||
    jobMetadata.status !== "PREPARED" ||
    jobMetadata.training_execution_authorized !== false ||
    jobMetadata.automatic_training_started !== false ||
    jobMetadata.automatic_model_weight_mutation !== false ||
    text(jobMetadata.foundation_model, 300) !== FOUNDATION_MODEL
  ) {
    throw new Error("AVANTIQO_MODEL_TRAINING_READINESS_JOB_NOT_SAFE_PREPARED");
  }

  const datasetManifestId = text(jobMetadata.dataset_manifest_id, 160);
  if (!datasetManifestId) {
    throw new Error("AVANTIQO_MODEL_TRAINING_READINESS_DATASET_BINDING_REQUIRED");
  }
  const dataset = await loadOne({
    organizationId,
    scope: DATASET_SCOPE,
    id: datasetManifestId,
  });
  const datasetMetadata = assertDataset(dataset, jobMetadata);

  const candidateIds = list(datasetMetadata.candidate_ids)
    .map((item) => text(item, 160))
    .filter(Boolean);
  const candidates = await loadMany({
    organizationId,
    scope: CANDIDATE_SCOPE,
    ids: candidateIds,
  });
  const candidateState = assertCandidates(datasetMetadata, candidates);

  const exampleIds = [
    ...list(jobMetadata.train_example_ids),
    ...list(jobMetadata.holdout_example_ids),
  ].map((item) => text(item, 160)).filter(Boolean);
  const examples = await loadMany({
    organizationId,
    scope: EXAMPLE_SCOPE,
    ids: [...new Set(exampleIds)],
  });
  const exampleState = assertExamples({
    jobMetadata,
    examples,
    candidatesById: candidateState.byId,
  });

  return {
    contract: AVANTIQO_MODEL_TRAINING_READINESS_CONTRACT,
    status: "READY_FOR_RESOURCE_PREFLIGHT",
    training_job_record_id: job.id,
    training_job_id: text(jobMetadata.job_id || job.subject, 160),
    foundation_model: FOUNDATION_MODEL,
    dataset_manifest_id: dataset.id,
    dataset_fingerprint: text(datasetMetadata.dataset_fingerprint, 128),
    candidate_count: candidateState.candidateIds.length,
    train_example_count: exampleState.train_example_count,
    holdout_example_count: exampleState.holdout_example_count,
    example_count: exampleState.example_count,
    example_fingerprint: exampleState.example_fingerprint,
    governance: {
      current_dataset_binding_verified: true,
      current_candidate_source_versions_verified: true,
      current_candidate_benchmarks_verified: true,
      current_example_bindings_verified: true,
      dataset_source_version_bound: true,
      dataset_benchmark_version_bound: true,
      provider_execution_used: false,
      runpod_used: false,
      shared_trainer_mutated: false,
      training_execution_authorized: false,
      training_execution_started: false,
      automatic_model_weight_mutation: false,
      production_model_promotion_effect: "NONE",
      shared_resource_preflight_still_required: true,
      explicit_execution_approval_still_required: true,
    },
  };
}

export const AvantiqoModelTrainingReadinessRuntime = Object.freeze({
  contract: AVANTIQO_MODEL_TRAINING_READINESS_CONTRACT,
  certify: certifyAvantiqoModelTrainingReadiness,
});
