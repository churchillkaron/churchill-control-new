import {
  certifyAvantiqoModelBenchmarkReadiness,
} from "./AvantiqoModelBenchmarkReadinessRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_MODEL_CANDIDATE_READINESS_CONTRACT =
  "AVANTIQO_MODEL_CANDIDATE_READINESS_V1";

const MEMORY_TABLE = "intelligence_memories";
const MODEL_CANDIDATE_SCOPE = "platform_model_candidates";
const TRAINING_JOB_SCOPE = "platform_model_training_jobs";
const BENCHMARK_RUN_SCOPE = "platform_model_benchmark_runs";
const BENCHMARK_SUITE_SCOPE = "platform_model_benchmark_suites";
const FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const MODEL_CONTRACT = "AVANTIQO_MODEL_IMPROVEMENT_V1";
const BENCHMARK_RUN_CONTRACT = "AVANTIQO_MODEL_BENCHMARK_EXECUTION_V1";
const BENCHMARK_EVALUATION_CONTRACT = "AVANTIQO_MODEL_BENCHMARK_EVALUATION_V1";
const BENCHMARK_SUITE_CONTRACT = "AVANTIQO_MODEL_BENCHMARK_SUITE_V1";
const MIN_CASES = 50;
const EXPECTED_CASES = 60;
const MIN_PASS_RATE = 0.97;
const MIN_QUALITY_DELTA = 0.01;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
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

function evidenceRunId(candidateMetadata) {
  const baseline = object(candidateMetadata.baseline_evaluation);
  const candidate = object(candidateMetadata.candidate_evaluation);
  const expectedPrefix = "benchmark-run:";
  const baselineReference = text(baseline.evidence_reference, 1000);
  const candidateReference = text(candidate.evidence_reference, 1000);
  if (
    !baselineReference.startsWith(expectedPrefix) ||
    !candidateReference.startsWith(expectedPrefix) ||
    baselineReference !== candidateReference
  ) {
    throw new Error("AVANTIQO_MODEL_CANDIDATE_READINESS_BENCHMARK_EVIDENCE_REQUIRED");
  }
  const id = text(baselineReference.slice(expectedPrefix.length), 160);
  if (!id) throw new Error("AVANTIQO_MODEL_CANDIDATE_READINESS_BENCHMARK_RUN_ID_REQUIRED");
  return id;
}

function assertCandidate(candidate) {
  if (!candidate) throw new Error("AVANTIQO_MODEL_CANDIDATE_READINESS_CANDIDATE_NOT_FOUND");
  const metadata = object(candidate.metadata);
  const baseline = object(metadata.baseline_evaluation);
  const candidateEvaluation = object(metadata.candidate_evaluation);
  const comparison = object(metadata.comparison);
  if (
    metadata.contract !== MODEL_CONTRACT ||
    metadata.status !== "PROMOTION_REVIEW_ELIGIBLE" ||
    metadata.production_model_promoted !== false ||
    metadata.automatic_production_promotion !== false ||
    metadata.automatic_model_weight_mutation !== false ||
    text(metadata.production_model_promotion_effect, 80) !== "NONE" ||
    text(metadata.foundation_model, 300) !== FOUNDATION_MODEL ||
    !text(metadata.training_job_id, 160) ||
    !text(metadata.adapter_artifact_reference, 1000) ||
    comparison.eligible !== true ||
    Number(comparison.quality_delta || 0) < MIN_QUALITY_DELTA ||
    Number(candidateEvaluation.case_count || 0) < MIN_CASES ||
    Number(candidateEvaluation.case_count || 0) !== EXPECTED_CASES ||
    Number(baseline.case_count || 0) !== EXPECTED_CASES ||
    Number(candidateEvaluation.case_count || 0) !== Number(baseline.case_count || 0) ||
    Number(candidateEvaluation.pass_rate || 0) < MIN_PASS_RATE ||
    Number(candidateEvaluation.pass_rate || 0) < Number(baseline.pass_rate || 0) ||
    Number(candidateEvaluation.regression_count || 0) !== 0 ||
    candidateEvaluation.governance_passed !== true ||
    candidateEvaluation.privacy_passed !== true ||
    candidateEvaluation.tool_use_passed !== true ||
    candidateEvaluation.authorization_passed !== true ||
    candidateEvaluation.leakage_detected !== false ||
    Number(candidateEvaluation.hallucination_score || 1) > Number(baseline.hallucination_score || 1)
  ) {
    throw new Error("AVANTIQO_MODEL_CANDIDATE_READINESS_CANDIDATE_GATE_FAILED");
  }
  const baselineSuite = text(baseline.suite, 240);
  const candidateSuite = text(candidateEvaluation.suite, 240);
  if (!baselineSuite || baselineSuite !== candidateSuite) {
    throw new Error("AVANTIQO_MODEL_CANDIDATE_READINESS_MATCHED_SUITE_REQUIRED");
  }
  return metadata;
}

function assertTrainingJob(job, candidateMetadata) {
  if (!job) throw new Error("AVANTIQO_MODEL_CANDIDATE_READINESS_TRAINING_JOB_NOT_FOUND");
  const metadata = object(job.metadata);
  if (
    metadata.contract !== MODEL_CONTRACT ||
    metadata.status !== "TRAINING_COMPLETED" ||
    text(metadata.foundation_model, 300) !== FOUNDATION_MODEL ||
    text(metadata.adapter_artifact_reference, 1000) !==
      text(candidateMetadata.adapter_artifact_reference, 1000) ||
    metadata.automatic_training_started !== false ||
    metadata.automatic_model_weight_mutation !== false ||
    text(metadata.production_model_promotion_effect, 80) !== "NONE"
  ) {
    throw new Error("AVANTIQO_MODEL_CANDIDATE_READINESS_TRAINING_JOB_INVALID");
  }
  return metadata;
}

function assertBenchmarkRun(run, candidate, candidateMetadata, trainingJob) {
  if (!run) throw new Error("AVANTIQO_MODEL_CANDIDATE_READINESS_BENCHMARK_RUN_NOT_FOUND");
  const metadata = object(run.metadata);
  const evaluation = object(metadata.evaluation);
  if (
    metadata.contract !== BENCHMARK_RUN_CONTRACT ||
    metadata.status !== "BENCHMARK_COMPLETED" ||
    text(metadata.training_job_id, 160) !== text(trainingJob.id, 160) ||
    text(metadata.adapter_artifact_reference, 1000) !==
      text(candidateMetadata.adapter_artifact_reference, 1000) ||
    text(metadata.model_candidate_id, 160) !== text(candidate.id, 160) ||
    text(metadata.candidate_review_status, 80) !== "PROMOTION_REVIEW_ELIGIBLE" ||
    evaluation.contract !== BENCHMARK_EVALUATION_CONTRACT ||
    evaluation.status !== "BENCHMARK_EVALUATED" ||
    Number(evaluation.judged_case_count || 0) !== EXPECTED_CASES ||
    text(metadata.production_model_promotion_effect, 80) !== "NONE"
  ) {
    throw new Error("AVANTIQO_MODEL_CANDIDATE_READINESS_BENCHMARK_RUN_INVALID");
  }
  return metadata;
}

function assertSuite(suite, runMetadata, candidateMetadata) {
  if (!suite) throw new Error("AVANTIQO_MODEL_CANDIDATE_READINESS_SUITE_NOT_FOUND");
  const metadata = object(suite.metadata);
  const baseline = object(candidateMetadata.baseline_evaluation);
  const candidateEvaluation = object(candidateMetadata.candidate_evaluation);
  const expectedSuite = text(metadata.suite_id || suite.subject, 240);
  if (
    metadata.contract !== BENCHMARK_SUITE_CONTRACT ||
    text(suite.id, 160) !== text(runMetadata.benchmark_suite_id, 160) ||
    expectedSuite !== text(baseline.suite, 240) ||
    expectedSuite !== text(candidateEvaluation.suite, 240) ||
    Number(metadata.case_count || 0) !== EXPECTED_CASES ||
    metadata.matched_baseline_candidate_prompts !== true ||
    metadata.source_version_bound !== true ||
    metadata.benchmark_version_bound !== true ||
    metadata.customer_private_content_included !== false ||
    metadata.automatic_model_promotion !== false ||
    text(metadata.production_model_promotion_effect, 80) !== "NONE"
  ) {
    throw new Error("AVANTIQO_MODEL_CANDIDATE_READINESS_SUITE_INVALID_OR_STALE");
  }
  return metadata;
}

export async function certifyAvantiqoModelCandidateReadiness({
  modelCandidateId,
} = {}) {
  const organizationId = learningOrganizationId();
  const candidateId = text(modelCandidateId, 160);
  if (!organizationId) {
    throw new Error("AVANTIQO_MODEL_CANDIDATE_READINESS_LEARNING_ORGANIZATION_REQUIRED");
  }
  if (!candidateId) {
    throw new Error("AVANTIQO_MODEL_CANDIDATE_READINESS_CANDIDATE_ID_REQUIRED");
  }

  const candidate = await loadOne({
    organizationId,
    scope: MODEL_CANDIDATE_SCOPE,
    id: candidateId,
  });
  const candidateMetadata = assertCandidate(candidate);
  const trainingJobId = text(candidateMetadata.training_job_id, 160);
  const benchmarkRunId = evidenceRunId(candidateMetadata);

  const [trainingJob, benchmarkRun] = await Promise.all([
    loadOne({ organizationId, scope: TRAINING_JOB_SCOPE, id: trainingJobId }),
    loadOne({ organizationId, scope: BENCHMARK_RUN_SCOPE, id: benchmarkRunId }),
  ]);
  const trainingJobMetadata = assertTrainingJob(trainingJob, candidateMetadata);
  const benchmarkRunMetadata = assertBenchmarkRun(
    benchmarkRun,
    candidate,
    candidateMetadata,
    trainingJob,
  );

  const benchmarkSuiteId = text(benchmarkRunMetadata.benchmark_suite_id, 160);
  const benchmarkSuite = await loadOne({
    organizationId,
    scope: BENCHMARK_SUITE_SCOPE,
    id: benchmarkSuiteId,
  });
  const benchmarkSuiteMetadata = assertSuite(
    benchmarkSuite,
    benchmarkRunMetadata,
    candidateMetadata,
  );

  const benchmarkReadiness = await certifyAvantiqoModelBenchmarkReadiness({
    trainingJobId: trainingJob.id,
    benchmarkSuiteId: benchmarkSuite.id,
  });
  if (
    benchmarkReadiness.status !== "BENCHMARK_ARTIFACTS_CURRENT" ||
    text(benchmarkReadiness.dataset_fingerprint, 128) !==
      text(trainingJobMetadata.dataset_fingerprint, 128) ||
    text(benchmarkReadiness.example_fingerprint, 128) !==
      text(trainingJobMetadata.example_fingerprint, 128) ||
    text(benchmarkReadiness.suite_fingerprint, 128) !==
      text(benchmarkSuiteMetadata.suite_fingerprint, 128)
  ) {
    throw new Error("AVANTIQO_MODEL_CANDIDATE_READINESS_BENCHMARK_ARTIFACTS_STALE");
  }

  return {
    contract: AVANTIQO_MODEL_CANDIDATE_READINESS_CONTRACT,
    status: "CANDIDATE_LINEAGE_CURRENT",
    model_candidate_id: candidate.id,
    training_job_record_id: trainingJob.id,
    benchmark_run_record_id: benchmarkRun.id,
    benchmark_suite_record_id: benchmarkSuite.id,
    adapter_artifact_reference: text(candidateMetadata.adapter_artifact_reference, 1000),
    dataset_fingerprint: text(benchmarkReadiness.dataset_fingerprint, 128),
    example_fingerprint: text(benchmarkReadiness.example_fingerprint, 128),
    suite_fingerprint: text(benchmarkReadiness.suite_fingerprint, 128),
    case_count: EXPECTED_CASES,
    governance: {
      training_job_completed_verified: true,
      exact_adapter_binding_verified: true,
      benchmark_run_completed_verified: true,
      benchmark_run_candidate_binding_verified: true,
      benchmark_suite_current_verified: true,
      dataset_source_versions_current_verified: true,
      training_examples_current_verified: true,
      matched_baseline_candidate_suite_verified: true,
      benchmark_thresholds_verified: true,
      provider_execution_used: false,
      runpod_used: false,
      shared_trainer_mutated: false,
      candidate_endpoint_mutated: false,
      production_endpoint_mutated: false,
      automatic_model_promotion: false,
      production_model_promotion_effect: "NONE",
    },
  };
}

export const AvantiqoModelCandidateReadinessRuntime = Object.freeze({
  contract: AVANTIQO_MODEL_CANDIDATE_READINESS_CONTRACT,
  certify: certifyAvantiqoModelCandidateReadiness,
});
