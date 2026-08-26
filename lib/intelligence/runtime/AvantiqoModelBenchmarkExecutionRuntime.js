import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  evaluateAvantiqoModelBenchmark,
} from "./AvantiqoModelBenchmarkEvaluationRuntime";
import {
  recordAvantiqoModelCandidateEvaluation,
} from "./AvantiqoModelImprovementRuntime";
import {
  certifyAvantiqoModelBenchmarkReadiness,
} from "./AvantiqoModelBenchmarkReadinessRuntime";
import {
  requireAvantiqoModelImprovementSafeLease,
} from "./AvantiqoModelImprovementSafeLeaseGuard";

export const AVANTIQO_MODEL_BENCHMARK_EXECUTION_CONTRACT =
  "AVANTIQO_MODEL_BENCHMARK_EXECUTION_V1";

const MEMORY_TABLE = "intelligence_memories";
const TRAINING_JOB_SCOPE = "platform_model_training_jobs";
const BENCHMARK_SUITE_SCOPE = "platform_model_benchmark_suites";
const BENCHMARK_RUN_SCOPE = "platform_model_benchmark_runs";
const FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const DEFAULT_TIMEOUT_MS = 30000;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value, 20).toLowerCase());
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function benchmarkConfig() {
  if (!enabled(process.env.AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED)) {
    throw new Error("AVANTIQO_INTELLIGENCE_BENCHMARK_DISABLED");
  }
  const configuredEndpointId = text(
    process.env.RUNPOD_AVANTIQO_INTELLIGENCE_BENCHMARK_ENDPOINT_ID,
    160,
  ) || text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID, 160);
  if (!configuredEndpointId) {
    throw new Error("RUNPOD_AVANTIQO_INTELLIGENCE_BENCHMARK_ENDPOINT_ID_REQUIRED");
  }
  const safeLease = requireAvantiqoModelImprovementSafeLease("benchmark", {
    configuredEndpointId,
  });
  const endpointId = safeLease.endpoint_id;
  const apiKey = text(process.env.RUNPOD_API_KEY, 1000);
  if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
  return {
    endpointId,
    apiKey,
    safeLease,
    baseUrl: `${RUNPOD_API_BASE}/${endpointId}`,
    timeoutMs: Math.max(
      1000,
      Number(process.env.AVANTIQO_INTELLIGENCE_BENCHMARK_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    ),
  };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function responseJson(response) {
  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { message: raw };
  }
  if (!response.ok) {
    throw new Error(
      `AVANTIQO_BENCHMARK_RUNPOD_REQUEST_FAILED:${response.status}:${text(body?.error?.message || body?.error || body?.message, 800) || "UNKNOWN"}`,
    );
  }
  return body;
}

function runpodStatus(value) {
  const status = text(value, 80).toUpperCase();
  if (["COMPLETED", "COMPLETE", "SUCCEEDED", "SUCCESS", "DONE"].includes(status)) return "completed";
  if (["FAILED", "ERROR", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(status)) return "failed";
  if (["IN_QUEUE", "QUEUED", "PENDING"].includes(status)) return "queued";
  return "processing";
}

async function loadRow({ organizationId, scope, id }) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,memory_type,subject,content,metadata,active,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", scope)
    .eq("id", id)
    .eq("active", true)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function submitPairedGeneration({ config, suite, adapterArtifactReference }) {
  const metadata = object(suite.metadata);
  const cases = list(metadata.cases);
  if (cases.length < 50) throw new Error("AVANTIQO_BENCHMARK_MINIMUM_50_CASES_REQUIRED");
  const response = await fetchWithTimeout(
    `${config.baseUrl}/run`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        input: {
          contract: "AVANTIQO_INTELLIGENCE_BENCHMARK_WORKER_V1",
          execute_benchmark: true,
          mode: "paired",
          foundation_model: FOUNDATION_MODEL,
          adapter_artifact_reference: adapterArtifactReference,
          max_new_tokens: 512,
          cases: cases.map((item) => ({
            id: item.id,
            category: item.category,
            capability_key: item.capability_key,
            prompt: item.prompt,
          })),
        },
      }),
    },
    config.timeoutMs,
  );
  const body = await responseJson(response);
  const jobId = text(body.id || body.job_id || body.jobId, 240);
  if (!jobId) throw new Error("AVANTIQO_BENCHMARK_PAIRED_PROVIDER_JOB_ID_REQUIRED");
  return jobId;
}

async function persistRun({ organizationId, trainingJob, suite, providerJobId, readiness, safeLease }) {
  const now = new Date().toISOString();
  const runId = `avantiqo-intelligence-benchmark-run-${randomUUID()}`;
  const metadata = {
    contract: AVANTIQO_MODEL_BENCHMARK_EXECUTION_CONTRACT,
    run_id: runId,
    training_job_id: trainingJob.id,
    benchmark_suite_id: suite.id,
    benchmark_suite_name: suite.subject,
    paired_provider_job_id: providerJobId,
    provider_job_count: 1,
    adapter_artifact_reference: text(trainingJob?.metadata?.adapter_artifact_reference, 1000),
    safe_lease: safeLease,
    benchmark_readiness: {
      contract: readiness.contract,
      status: readiness.status,
      suite_fingerprint: readiness.suite_fingerprint,
      dataset_fingerprint: readiness.dataset_fingerprint,
      example_fingerprint: readiness.example_fingerprint,
      candidate_count: readiness.candidate_count,
      example_count: readiness.example_count,
      case_count: readiness.case_count,
    },
    status: "BENCHMARK_SUBMITTED",
    matched_prompt_set: true,
    paired_single_job: true,
    baseline_completed: false,
    candidate_completed: false,
    automatic_model_promotion: false,
    production_model_promotion_effect: "NONE",
    submitted_at: now,
  };
  const result = await supabaseAdmin.from(MEMORY_TABLE).insert({
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: BENCHMARK_RUN_SCOPE,
    memory_key: `benchmark-run:${randomUUID()}`,
    memory_type: "goal",
    subject: runId,
    content: `Submitted matched baseline/candidate benchmark ${runId} as one leased RunPod job.`,
    importance: 0.98,
    confidence: 1,
    source: "controlled_model_benchmark_execution",
    active: true,
    valid_until: null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata,
    updated_at: now,
  }).select("id,subject,content,metadata,updated_at").single();
  if (result.error) throw result.error;
  return result.data;
}

async function updateRun(organizationId, run, patch) {
  const now = new Date().toISOString();
  const metadata = { ...object(run.metadata), ...object(patch), updated_at: now };
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({ metadata, updated_at: now })
    .eq("organization_id", organizationId)
    .eq("memory_scope", BENCHMARK_RUN_SCOPE)
    .eq("id", run.id)
    .select("id,subject,content,metadata,updated_at")
    .single();
  if (result.error) throw result.error;
  return result.data;
}

async function providerStatus(config, providerJobId) {
  const response = await fetchWithTimeout(
    `${config.baseUrl}/status/${encodeURIComponent(providerJobId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${config.apiKey}`, Accept: "application/json" },
    },
    config.timeoutMs,
  );
  const body = await responseJson(response);
  return { status: runpodStatus(body.status), body };
}

function validatedPairedOutputs(body, expectedCount) {
  const output = object(body.output);
  if (text(output.contract, 160) !== "AVANTIQO_INTELLIGENCE_BENCHMARK_WORKER_V1") {
    throw new Error("AVANTIQO_BENCHMARK_WORKER_CONTRACT_MISMATCH");
  }
  if (text(output.mode, 40) !== "paired") {
    throw new Error("AVANTIQO_BENCHMARK_WORKER_PAIRED_MODE_REQUIRED");
  }
  if (Number(output.case_count || 0) !== expectedCount) {
    throw new Error("AVANTIQO_BENCHMARK_WORKER_CASE_COUNT_MISMATCH");
  }
  const baselineOutputs = list(output.baseline_outputs);
  const candidateOutputs = list(output.candidate_outputs);
  if (baselineOutputs.length !== expectedCount || candidateOutputs.length !== expectedCount) {
    throw new Error("AVANTIQO_BENCHMARK_WORKER_PAIRED_OUTPUT_COUNT_MISMATCH");
  }
  const baselineIds = baselineOutputs.map((item) => text(item?.id, 160));
  const candidateIds = candidateOutputs.map((item) => text(item?.id, 160));
  if (baselineIds.some((id, index) => !id || id !== candidateIds[index])) {
    throw new Error("AVANTIQO_BENCHMARK_WORKER_PAIRED_CASE_ID_MISMATCH");
  }
  if (
    output?.generation?.single_runpod_job !== true ||
    output?.generation?.matched_prompt_set !== true ||
    output?.governance?.production_model_mutated !== false ||
    output?.governance?.production_model_promoted !== false
  ) {
    throw new Error("AVANTIQO_BENCHMARK_WORKER_GOVERNANCE_INVARIANT_FAILED");
  }
  return { baselineOutputs, candidateOutputs };
}

export async function submitAvantiqoModelBenchmark({ trainingJobId, benchmarkSuiteId, approved = false } = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) throw new Error("AVANTIQO_BENCHMARK_LEARNING_ORGANIZATION_REQUIRED");
  if (approved !== true) throw new Error("AVANTIQO_BENCHMARK_EXPLICIT_APPROVAL_REQUIRED");
  const trainingJob = await loadRow({ organizationId, scope: TRAINING_JOB_SCOPE, id: text(trainingJobId, 160) });
  if (!trainingJob) throw new Error("AVANTIQO_BENCHMARK_TRAINING_JOB_NOT_FOUND");
  const trainingMetadata = object(trainingJob.metadata);
  if (text(trainingMetadata.status, 80) !== "TRAINING_COMPLETED") {
    throw new Error("AVANTIQO_BENCHMARK_TRAINING_NOT_COMPLETED");
  }
  const adapter = text(trainingMetadata.adapter_artifact_reference, 1000);
  if (!adapter) throw new Error("AVANTIQO_BENCHMARK_ADAPTER_REQUIRED");
  const suite = await loadRow({ organizationId, scope: BENCHMARK_SUITE_SCOPE, id: text(benchmarkSuiteId, 160) });
  if (!suite) throw new Error("AVANTIQO_BENCHMARK_SUITE_NOT_FOUND");
  if (text(suite?.metadata?.contract, 160) !== "AVANTIQO_MODEL_BENCHMARK_SUITE_V1") {
    throw new Error("AVANTIQO_BENCHMARK_SUITE_CONTRACT_INVALID");
  }
  if (text(suite?.metadata?.training_job_id, 160) !== trainingJob.id) {
    throw new Error("AVANTIQO_BENCHMARK_SUITE_TRAINING_JOB_MISMATCH");
  }

  const readiness = await certifyAvantiqoModelBenchmarkReadiness({
    trainingJobId: trainingJob.id,
    benchmarkSuiteId: suite.id,
  });
  if (readiness.status !== "BENCHMARK_ARTIFACTS_CURRENT") {
    throw new Error(
      `AVANTIQO_BENCHMARK_ARTIFACT_READINESS_FAILED:${readiness.status || "UNKNOWN"}`,
    );
  }

  const config = benchmarkConfig();
  const providerJobId = await submitPairedGeneration({
    config,
    suite,
    adapterArtifactReference: adapter,
  });
  const run = await persistRun({
    organizationId,
    trainingJob,
    suite,
    providerJobId,
    readiness,
    safeLease: config.safeLease,
  });
  return {
    contract: AVANTIQO_MODEL_BENCHMARK_EXECUTION_CONTRACT,
    status: "BENCHMARK_SUBMITTED",
    provider_job_id: providerJobId,
    run,
    governance: {
      explicit_execution_approval_observed: true,
      safe_lease_v2_required: true,
      safe_lease_lane: config.safeLease.lease_lane,
      leased_endpoint_binding_verified: config.safeLease.endpoint_id === config.endpointId,
      provider_job_count: 1,
      one_job_per_lease_preserved: true,
      current_training_artifacts_verified: true,
      current_benchmark_suite_binding_verified: true,
      matched_prompt_set: true,
      paired_baseline_candidate_execution: true,
      candidate_did_not_grade_itself: true,
      automatic_model_promotion: false,
      production_model_promotion_effect: "NONE",
    },
  };
}

export async function refreshAvantiqoModelBenchmark({ benchmarkRunId } = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) throw new Error("AVANTIQO_BENCHMARK_LEARNING_ORGANIZATION_REQUIRED");
  const run = await loadRow({ organizationId, scope: BENCHMARK_RUN_SCOPE, id: text(benchmarkRunId, 160) });
  if (!run) throw new Error("AVANTIQO_BENCHMARK_RUN_NOT_FOUND");
  const metadata = object(run.metadata);
  const trainingJob = await loadRow({ organizationId, scope: TRAINING_JOB_SCOPE, id: text(metadata.training_job_id, 160) });
  const suite = await loadRow({ organizationId, scope: BENCHMARK_SUITE_SCOPE, id: text(metadata.benchmark_suite_id, 160) });
  if (!trainingJob || !suite) throw new Error("AVANTIQO_BENCHMARK_BOUND_RECORDS_MISSING");
  const config = benchmarkConfig();
  const submittedLeaseEndpoint = text(metadata?.safe_lease?.endpoint_id, 200);
  if (submittedLeaseEndpoint && submittedLeaseEndpoint !== config.endpointId) {
    throw new Error("AVANTIQO_BENCHMARK_SAFE_LEASE_ENDPOINT_CHANGED");
  }
  const providerJobId = text(metadata.paired_provider_job_id, 240);
  if (!providerJobId) throw new Error("AVANTIQO_BENCHMARK_PAIRED_PROVIDER_JOB_ID_REQUIRED");
  const paired = await providerStatus(config, providerJobId);
  if (paired.status === "failed") {
    const failed = await updateRun(organizationId, run, {
      status: "BENCHMARK_FAILED",
      paired_status: paired.status,
      safe_lease_last_observed: config.safeLease,
      production_model_promotion_effect: "NONE",
    });
    return { contract: AVANTIQO_MODEL_BENCHMARK_EXECUTION_CONTRACT, status: "BENCHMARK_FAILED", run: failed };
  }
  if (paired.status !== "completed") {
    const pending = await updateRun(organizationId, run, {
      status: "BENCHMARK_RUNNING",
      paired_status: paired.status,
      safe_lease_last_observed: config.safeLease,
    });
    return { contract: AVANTIQO_MODEL_BENCHMARK_EXECUTION_CONTRACT, status: "BENCHMARK_RUNNING", run: pending };
  }

  const readiness = await certifyAvantiqoModelBenchmarkReadiness({
    trainingJobId: trainingJob.id,
    benchmarkSuiteId: suite.id,
  });
  if (readiness.status !== "BENCHMARK_ARTIFACTS_CURRENT") {
    const stale = await updateRun(organizationId, run, {
      status: "BENCHMARK_STALE",
      paired_status: "completed",
      safe_lease_last_observed: config.safeLease,
      production_model_promotion_effect: "NONE",
    });
    return {
      contract: AVANTIQO_MODEL_BENCHMARK_EXECUTION_CONTRACT,
      status: "BENCHMARK_STALE",
      run: stale,
      governance: {
        safe_lease_v2_required: true,
        current_training_artifacts_verified: false,
        automatic_model_promotion: false,
        production_model_promotion_effect: "NONE",
      },
    };
  }

  const caseCount = list(suite?.metadata?.cases).length;
  const { baselineOutputs, candidateOutputs } = validatedPairedOutputs(
    paired.body,
    caseCount,
  );
  const evaluation = await evaluateAvantiqoModelBenchmark({
    organizationId,
    suite,
    baselineOutputs,
    candidateOutputs,
  });
  const evidenceReference = `benchmark-run:${run.id}`;
  const candidateReview = await recordAvantiqoModelCandidateEvaluation({
    trainingJobId: trainingJob.id,
    adapterArtifactReference: text(trainingJob?.metadata?.adapter_artifact_reference, 1000),
    baselineEvaluation: {
      evaluation_id: `${evaluation.suite_id}:baseline`,
      suite: evaluation.suite_id,
      ...evaluation.baseline,
      evidence_reference: evidenceReference,
    },
    candidateEvaluation: {
      evaluation_id: `${evaluation.suite_id}:candidate`,
      suite: evaluation.suite_id,
      ...evaluation.candidate,
      regression_count: evaluation.regression_count,
      evidence_reference: evidenceReference,
    },
  });
  const completed = await updateRun(organizationId, run, {
    status: "BENCHMARK_COMPLETED",
    paired_status: "completed",
    baseline_status: "completed",
    candidate_status: "completed",
    safe_lease_last_observed: config.safeLease,
    benchmark_readiness: {
      contract: readiness.contract,
      status: readiness.status,
      suite_fingerprint: readiness.suite_fingerprint,
      dataset_fingerprint: readiness.dataset_fingerprint,
      example_fingerprint: readiness.example_fingerprint,
    },
    evaluation,
    candidate_review_status: candidateReview.status,
    model_candidate_id: candidateReview?.candidate?.id || null,
    completed_at: new Date().toISOString(),
    production_model_promotion_effect: "NONE",
  });
  return {
    contract: AVANTIQO_MODEL_BENCHMARK_EXECUTION_CONTRACT,
    status: "BENCHMARK_COMPLETED",
    evaluation,
    candidate_review: candidateReview,
    run: completed,
    governance: {
      safe_lease_v2_required: true,
      safe_lease_lane: config.safeLease.lease_lane,
      leased_endpoint_binding_verified: true,
      provider_job_count: 1,
      one_job_per_lease_preserved: true,
      current_training_artifacts_verified: true,
      current_benchmark_suite_binding_verified: true,
      matched_baseline_candidate_prompts: true,
      baseline_and_candidate_both_observed: true,
      blind_owned_evaluation: true,
      no_regression_gate_applied: true,
      automatic_model_promotion: false,
      production_model_promotion_effect: "NONE",
    },
  };
}

export const AvantiqoModelBenchmarkExecutionRuntime = Object.freeze({
  contract: AVANTIQO_MODEL_BENCHMARK_EXECUTION_CONTRACT,
  submit: submitAvantiqoModelBenchmark,
  refresh: refreshAvantiqoModelBenchmark,
});