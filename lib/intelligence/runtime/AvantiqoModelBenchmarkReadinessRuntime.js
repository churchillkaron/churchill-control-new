import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_MODEL_BENCHMARK_READINESS_CONTRACT =
  "AVANTIQO_MODEL_BENCHMARK_READINESS_V1";

const MEMORY_TABLE = "intelligence_memories";
const DATASET_SCOPE = "platform_training_datasets";
const CANDIDATE_SCOPE = "platform_training_candidates";
const EXAMPLE_SCOPE = "platform_training_examples";
const TRAINING_JOB_SCOPE = "platform_model_training_jobs";
const BENCHMARK_SUITE_SCOPE = "platform_model_benchmark_suites";
const FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const JOB_CONTRACT = "AVANTIQO_MODEL_IMPROVEMENT_V1";
const DATASET_CONTRACT = "AVANTIQO_TRAINING_DATASET_V1";
const CANDIDATE_CONTRACT = "AVANTIQO_CANONICAL_CURRICULUM_CANDIDATE_V1";
const EXAMPLE_CONTRACT = "AVANTIQO_TRAINING_EXAMPLE_COMPILER_V1";
const SUITE_CONTRACT = "AVANTIQO_MODEL_BENCHMARK_SUITE_V1";
const DETERMINISTIC_SUITE_CONTRACT =
  "AVANTIQO_DETERMINISTIC_MODEL_BENCHMARK_SUITE_V1";
const ALLOWED_JOB_STATUSES = new Set([
  "PREPARED",
  "TRAINING_SUBMITTED",
  "TRAINING_QUEUED",
  "TRAINING_RUNNING",
  "TRAINING_COMPLETED",
]);
const CATEGORY_TARGETS = Object.freeze({
  task_quality: 20,
  recovery_behavior: 10,
  evidence_tool_discipline: 10,
  authorization_governance: 10,
  privacy_leakage: 5,
  uncertainty_hallucination: 5,
});

function text(value, limit = 4000) {
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

function assertJob(job) {
  if (!job) throw new Error("AVANTIQO_MODEL_BENCHMARK_READINESS_JOB_NOT_FOUND");
  const metadata = object(job.metadata);
  const status = text(metadata.status, 80);
  if (
    metadata.contract !== JOB_CONTRACT ||
    !ALLOWED_JOB_STATUSES.has(status) ||
    metadata.automatic_training_started !== false ||
    metadata.automatic_model_weight_mutation !== false ||
    text(metadata.production_model_promotion_effect, 80) !== "NONE" ||
    text(metadata.foundation_model, 300) !== FOUNDATION_MODEL
  ) {
    throw new Error("AVANTIQO_MODEL_BENCHMARK_READINESS_JOB_INVALID");
  }
  return metadata;
}

function assertSuite(suite, job, jobMetadata) {
  if (!suite) throw new Error("AVANTIQO_MODEL_BENCHMARK_READINESS_SUITE_NOT_FOUND");
  const metadata = object(suite.metadata);
  const cases = list(metadata.cases);
  if (
    metadata.contract !== SUITE_CONTRACT ||
    metadata.compiler_variant_contract !== DETERMINISTIC_SUITE_CONTRACT ||
    text(metadata.training_job_id, 160) !== text(job.id, 160) ||
    text(metadata.dataset_manifest_id, 160) !== text(jobMetadata.dataset_manifest_id, 160) ||
    text(metadata.dataset_fingerprint, 128) !== text(jobMetadata.dataset_fingerprint, 128) ||
    text(metadata.example_fingerprint, 128) !== text(jobMetadata.example_fingerprint, 128) ||
    metadata.source_version_bound !== true ||
    metadata.benchmark_version_bound !== true ||
    metadata.matched_baseline_candidate_prompts !== true ||
    metadata.customer_private_content_included !== false ||
    metadata.raw_customer_turns_included !== false ||
    metadata.raw_payload_included !== false ||
    metadata.raw_output_included !== false ||
    metadata.raw_reasoning_required !== false ||
    metadata.identifiers_included !== false ||
    metadata.automatic_training_started !== false ||
    metadata.automatic_model_weight_mutation !== false ||
    metadata.automatic_model_promotion !== false ||
    text(metadata.production_model_promotion_effect, 80) !== "NONE" ||
    cases.length !== 60
  ) {
    throw new Error("AVANTIQO_MODEL_BENCHMARK_READINESS_SUITE_INVALID_OR_STALE");
  }
  for (const [category, expected] of Object.entries(CATEGORY_TARGETS)) {
    const actual = cases.filter((item) => text(item?.category, 80) === category).length;
    if (actual !== expected) {
      throw new Error(
        `AVANTIQO_MODEL_BENCHMARK_READINESS_CATEGORY_MISMATCH:${category}:${actual}:${expected}`,
      );
    }
  }
  const caseIds = cases.map((item) => text(item?.id, 160)).filter(Boolean);
  if (new Set(caseIds).size !== 60) {
    throw new Error("AVANTIQO_MODEL_BENCHMARK_READINESS_CASE_IDS_INVALID");
  }
  return metadata;
}

function assertDataset(dataset, jobMetadata, suiteMetadata) {
  if (!dataset) throw new Error("AVANTIQO_MODEL_BENCHMARK_READINESS_DATASET_NOT_FOUND");
  const metadata = object(dataset.metadata);
  if (
    metadata.contract !== DATASET_CONTRACT ||
    metadata.status !== "DATASET_ASSEMBLED" ||
    metadata.training_ready !== true ||
    metadata.source_version_bound !== true ||
    metadata.benchmark_version_bound !== true ||
    text(dataset.id, 160) !== text(jobMetadata.dataset_manifest_id, 160) ||
    text(metadata.dataset_fingerprint, 128) !== text(jobMetadata.dataset_fingerprint, 128) ||
    text(metadata.dataset_fingerprint, 128) !== text(suiteMetadata.dataset_fingerprint, 128)
  ) {
    throw new Error("AVANTIQO_MODEL_BENCHMARK_READINESS_DATASET_STALE");
  }
  return metadata;
}

function assertCandidates(datasetMetadata, candidates) {
  const candidateIds = list(datasetMetadata.candidate_ids)
    .map((item) => text(item, 160))
    .filter(Boolean);
  const bindings = new Map(
    list(datasetMetadata.candidate_bindings).map((binding) => [
      text(binding?.candidate_id, 160),
      object(binding),
    ]),
  );
  if (
    candidateIds.length !== 27 ||
    candidates.length !== candidateIds.length ||
    bindings.size !== candidateIds.length
  ) {
    throw new Error("AVANTIQO_MODEL_BENCHMARK_READINESS_CANDIDATES_INCOMPLETE");
  }
  const byId = new Map(candidates.map((row) => [text(row.id, 160), row]));
  for (const candidateId of candidateIds) {
    const candidate = byId.get(candidateId);
    const metadata = object(candidate?.metadata);
    const binding = bindings.get(candidateId);
    const fingerprint = candidateFingerprint(candidate);
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
      text(binding.curriculum_fingerprint, 128) !== fingerprint ||
      text(binding.source_candidate_fingerprint, 128) !== text(metadata.source_fingerprint, 128) ||
      text(binding.source_benchmark_id, 240) !== text(metadata?.benchmark?.benchmark_id, 240) ||
      text(binding.source_benchmark_suite, 240) !== text(metadata?.benchmark?.benchmark_suite, 240)
    ) {
      throw new Error(
        `AVANTIQO_MODEL_BENCHMARK_READINESS_CANDIDATE_STALE:${candidateId}`,
      );
    }
  }
  return { candidateIds, byId };
}

function assertExamples({ jobMetadata, suiteMetadata, examples, candidatesById }) {
  const trainIds = list(jobMetadata.train_example_ids)
    .map((item) => text(item, 160))
    .filter(Boolean);
  const holdoutIds = list(jobMetadata.holdout_example_ids)
    .map((item) => text(item, 160))
    .filter(Boolean);
  const allIds = [...new Set([...trainIds, ...holdoutIds])];
  if (
    trainIds.length !== 44 ||
    holdoutIds.length !== 10 ||
    allIds.length !== 54 ||
    examples.length !== 54
  ) {
    throw new Error("AVANTIQO_MODEL_BENCHMARK_READINESS_EXAMPLES_INCOMPLETE");
  }
  const byId = new Map(examples.map((row) => [text(row.id, 160), row]));
  for (const id of allIds) {
    const row = byId.get(id);
    const metadata = object(row?.metadata);
    const candidate = candidatesById.get(text(metadata.source_candidate_id, 160));
    const candidateMetadata = object(candidate?.metadata);
    if (
      !row ||
      metadata.contract !== EXAMPLE_CONTRACT ||
      metadata.training_example_validated !== true ||
      metadata.synthetic !== true ||
      metadata.source_version_bound !== true ||
      metadata.benchmark_version_bound !== true ||
      metadata.customer_private_content_included !== false ||
      metadata.raw_customer_turn_included !== false ||
      metadata.raw_payload_included !== false ||
      metadata.raw_output_included !== false ||
      metadata.raw_reasoning_included !== false ||
      metadata.identifiers_included !== false ||
      text(metadata.dataset_manifest_id, 160) !== text(jobMetadata.dataset_manifest_id, 160) ||
      text(metadata.dataset_fingerprint, 128) !== text(jobMetadata.dataset_fingerprint, 128) ||
      !candidate ||
      text(metadata.source_candidate_fingerprint, 128) !== text(candidateMetadata.source_fingerprint, 128) ||
      text(metadata.source_benchmark_id, 240) !== text(candidateMetadata?.benchmark?.benchmark_id, 240) ||
      text(metadata.source_benchmark_suite, 240) !== text(candidateMetadata?.benchmark?.benchmark_suite, 240)
    ) {
      throw new Error(`AVANTIQO_MODEL_BENCHMARK_READINESS_EXAMPLE_STALE:${id}`);
    }
  }
  const fingerprint = stableHash([
    ...trainIds.map((id) => text(byId.get(id)?.memory_key, 240)),
    "HOLDOUT",
    ...holdoutIds.map((id) => text(byId.get(id)?.memory_key, 240)),
  ].join("|"));
  if (
    fingerprint !== text(jobMetadata.example_fingerprint, 128) ||
    fingerprint !== text(suiteMetadata.example_fingerprint, 128)
  ) {
    throw new Error("AVANTIQO_MODEL_BENCHMARK_READINESS_EXAMPLE_FINGERPRINT_MISMATCH");
  }
  return fingerprint;
}

export async function certifyAvantiqoModelBenchmarkReadiness({
  trainingJobId,
  benchmarkSuiteId,
} = {}) {
  const organizationId = learningOrganizationId();
  const jobId = text(trainingJobId, 160);
  const suiteId = text(benchmarkSuiteId, 160);
  if (!organizationId) {
    throw new Error("AVANTIQO_MODEL_BENCHMARK_READINESS_LEARNING_ORGANIZATION_REQUIRED");
  }
  if (!jobId || !suiteId) {
    throw new Error("AVANTIQO_MODEL_BENCHMARK_READINESS_BINDINGS_REQUIRED");
  }

  const [job, suite] = await Promise.all([
    loadOne({ organizationId, scope: TRAINING_JOB_SCOPE, id: jobId }),
    loadOne({ organizationId, scope: BENCHMARK_SUITE_SCOPE, id: suiteId }),
  ]);
  const jobMetadata = assertJob(job);
  const suiteMetadata = assertSuite(suite, job, jobMetadata);

  const dataset = await loadOne({
    organizationId,
    scope: DATASET_SCOPE,
    id: text(jobMetadata.dataset_manifest_id, 160),
  });
  const datasetMetadata = assertDataset(dataset, jobMetadata, suiteMetadata);

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
  const exampleFingerprint = assertExamples({
    jobMetadata,
    suiteMetadata,
    examples,
    candidatesById: candidateState.byId,
  });

  return {
    contract: AVANTIQO_MODEL_BENCHMARK_READINESS_CONTRACT,
    status: "BENCHMARK_ARTIFACTS_CURRENT",
    training_job_record_id: job.id,
    training_job_status: text(jobMetadata.status, 80),
    benchmark_suite_record_id: suite.id,
    benchmark_suite_id: text(suiteMetadata.suite_id || suite.subject, 240),
    suite_fingerprint: text(suiteMetadata.suite_fingerprint, 128),
    dataset_manifest_id: dataset.id,
    dataset_fingerprint: text(datasetMetadata.dataset_fingerprint, 128),
    example_fingerprint: exampleFingerprint,
    candidate_count: candidateState.candidateIds.length,
    example_count: examples.length,
    case_count: list(suiteMetadata.cases).length,
    governance: {
      current_dataset_binding_verified: true,
      current_candidate_source_versions_verified: true,
      current_candidate_benchmarks_verified: true,
      current_example_bindings_verified: true,
      current_benchmark_suite_binding_verified: true,
      deterministic_suite_verified: true,
      source_version_bound: true,
      benchmark_version_bound: true,
      provider_execution_used: false,
      runpod_used: false,
      shared_trainer_mutated: false,
      automatic_model_weight_mutation: false,
      automatic_model_promotion: false,
      production_model_promotion_effect: "NONE",
    },
  };
}

export const AvantiqoModelBenchmarkReadinessRuntime = Object.freeze({
  contract: AVANTIQO_MODEL_BENCHMARK_READINESS_CONTRACT,
  certify: certifyAvantiqoModelBenchmarkReadiness,
});
