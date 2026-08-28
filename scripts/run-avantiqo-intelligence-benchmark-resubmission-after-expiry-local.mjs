import { spawnSync } from "node:child_process";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_INTELLIGENCE_BENCHMARK_RESUBMISSION_AFTER_EXPIRY_V1";
const TRAINING_SCOPE = "platform_model_training_jobs";
const BENCHMARK_SUITE_SCOPE = "platform_model_benchmark_suites";
const BENCHMARK_RUN_SCOPE = "platform_model_benchmark_runs";
const TRAINING_CONTRACT = "AVANTIQO_MODEL_IMPROVEMENT_V1";
const BENCHMARK_SUITE_CONTRACT = "AVANTIQO_MODEL_BENCHMARK_SUITE_V1";
const FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "intelligence-benchmark";
const RECOVERED_LEGACY_RUN_ID = "29cf42c0-fc4a-4519-b345-41b69765742e";
const POLL_MS = 5000;
const TERMINAL = new Set(["BENCHMARK_COMPLETED", "BENCHMARK_FAILED", "BENCHMARK_STALE"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value, 40).toUpperCase());
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function shell(name, args, label) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${label}:${text(result.stderr || result.stdout, 1000)}`);
  }
  return text(result.stdout, 4000);
}

function validateCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "BENCHMARK_RESUBMIT_GIT_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "BENCHMARK_RESUBMIT_GIT_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`BENCHMARK_RESUBMIT_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "BENCHMARK_RESUBMIT_GIT_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "BENCHMARK_RESUBMIT_GIT_REMOTE_FAILED");
  if (head !== remote) throw new Error(`BENCHMARK_RESUBMIT_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  return head;
}

function requireSafeLease() {
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE, 40).toUpperCase() !== "YES") {
    throw new Error("BENCHMARK_RESUBMIT_SAFE_LEASE_ACTIVE_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT, 120) !== SAFE_LEASE_CONTRACT) {
    throw new Error("BENCHMARK_RESUBMIT_SAFE_LEASE_V2_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE, 120) !== SAFE_LEASE_LANE) {
    throw new Error("BENCHMARK_RESUBMIT_SAFE_LEASE_LANE_REQUIRED");
  }
  const endpointId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID, 200);
  const configuredEndpointId = text(
    process.env.RUNPOD_AVANTIQO_INTELLIGENCE_BENCHMARK_ENDPOINT_ID ||
      process.env.RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID,
    200,
  );
  if (!endpointId || endpointId !== configuredEndpointId) {
    throw new Error("BENCHMARK_RESUBMIT_SAFE_LEASE_ENDPOINT_BINDING_REQUIRED");
  }
  const expiresAt = Date.parse(text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT, 160));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error("BENCHMARK_RESUBMIT_SAFE_LEASE_EXPIRY_REQUIRED");
  }
  return { endpointId, expiresAt };
}

if (!yes(process.env.AVANTIQO_MODEL_BENCHMARK_EXECUTION_APPROVED)) {
  throw new Error("AVANTIQO_MODEL_BENCHMARK_EXECUTION_APPROVED=YES_REQUIRED");
}
if (!yes(process.env.AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED)) {
  throw new Error("AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED=YES_REQUIRED");
}
if (text(process.env.NODE_ENV, 40).toLowerCase() !== "development") {
  throw new Error("BENCHMARK_RESUBMIT_DEVELOPMENT_ENV_REQUIRED");
}
if (!text(process.env.RUNPOD_API_KEY, 4000)) {
  throw new Error("BENCHMARK_RESUBMIT_RUNPOD_API_KEY_REQUIRED");
}

const safeLease = requireSafeLease();
const mainCommit = validateCurrentMain();

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));
const { ensureAvantiqoLearningOrganizationEnvironment } = await import(
  "@/lib/intelligence/runtime/AvantiqoLearningOrganizationRuntime"
);
const { certifyAvantiqoModelBenchmarkReadiness } = await import(
  "@/lib/intelligence/runtime/AvantiqoModelBenchmarkReadinessRuntime"
);
const {
  submitAvantiqoModelBenchmark,
  refreshAvantiqoModelBenchmark,
} = await import("@/lib/intelligence/runtime/AvantiqoModelBenchmarkExecutionRuntime");
const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");

const organization = await ensureAvantiqoLearningOrganizationEnvironment();

const trainingResult = await supabaseAdmin
  .from("intelligence_memories")
  .select("id,subject,metadata,updated_at")
  .eq("organization_id", organization.organization_id)
  .eq("memory_scope", TRAINING_SCOPE)
  .eq("active", true)
  .eq("metadata->>contract", TRAINING_CONTRACT)
  .eq("metadata->>foundation_model", FOUNDATION_MODEL)
  .eq("metadata->>status", "TRAINING_COMPLETED")
  .eq("metadata->>requires_candidate_benchmark", "true")
  .order("updated_at", { ascending: false })
  .limit(3);
if (trainingResult.error) throw trainingResult.error;
const trainingJobs = list(trainingResult.data);
if (trainingJobs.length !== 1) {
  throw new Error(`BENCHMARK_RESUBMIT_TRAINING_JOB_RESOLUTION_FAILED:${trainingJobs.length}`);
}
const trainingJob = trainingJobs[0];
const trainingMetadata = object(trainingJob.metadata);
const adapterArtifactReference = text(trainingMetadata.adapter_artifact_reference, 1200);
if (!adapterArtifactReference.startsWith("/runpod-volume/avantiqo-intelligence-training/") || !adapterArtifactReference.endsWith("/adapter")) {
  throw new Error("BENCHMARK_RESUBMIT_ADAPTER_ARTIFACT_INVALID");
}

const suiteResult = await supabaseAdmin
  .from("intelligence_memories")
  .select("id,subject,metadata,updated_at")
  .eq("organization_id", organization.organization_id)
  .eq("memory_scope", BENCHMARK_SUITE_SCOPE)
  .eq("active", true)
  .eq("metadata->>contract", BENCHMARK_SUITE_CONTRACT)
  .eq("metadata->>training_job_id", trainingJob.id)
  .order("updated_at", { ascending: false })
  .limit(3);
if (suiteResult.error) throw suiteResult.error;
const suites = list(suiteResult.data);
if (suites.length !== 1) throw new Error(`BENCHMARK_RESUBMIT_SUITE_RESOLUTION_FAILED:${suites.length}`);
const suite = suites[0];
if (list(object(suite.metadata).cases).length !== 60) {
  throw new Error("BENCHMARK_RESUBMIT_60_CASE_SUITE_REQUIRED");
}

const readiness = await certifyAvantiqoModelBenchmarkReadiness({
  trainingJobId: trainingJob.id,
  benchmarkSuiteId: suite.id,
});
if (
  readiness?.status !== "BENCHMARK_ARTIFACTS_CURRENT" ||
  Number(readiness.candidate_count || 0) !== 27 ||
  Number(readiness.example_count || 0) !== 54 ||
  Number(readiness.case_count || 0) !== 60
) {
  throw new Error(`BENCHMARK_RESUBMIT_ARTIFACT_READINESS_FAILED:${text(readiness?.status, 120) || "UNKNOWN"}`);
}

const priorResult = await supabaseAdmin
  .from("intelligence_memories")
  .select("id,subject,metadata,updated_at")
  .eq("organization_id", organization.organization_id)
  .eq("memory_scope", BENCHMARK_RUN_SCOPE)
  .eq("active", true)
  .eq("metadata->>training_job_id", trainingJob.id)
  .eq("metadata->>benchmark_suite_id", suite.id)
  .order("updated_at", { ascending: false })
  .limit(20);
if (priorResult.error) throw priorResult.error;
const priorRuns = list(priorResult.data);
if (priorRuns.length !== 1) {
  throw new Error(`BENCHMARK_RESUBMIT_EXACTLY_ONE_RECOVERED_LEGACY_RUN_REQUIRED:${priorRuns.length}`);
}
const legacyRun = priorRuns[0];
const legacyMetadata = object(legacyRun.metadata);
if (
  legacyRun.id !== RECOVERED_LEGACY_RUN_ID ||
  text(legacyMetadata.status, 120) !== "BENCHMARK_RECOVERY_REQUIRED" ||
  legacyMetadata.baseline_result_missing !== true ||
  legacyMetadata.candidate_result_missing !== true ||
  text(legacyMetadata.recovery_reason, 300) !== "RUNPOD_RESULTS_EXPIRED_BEFORE_PERSISTENCE" ||
  text(legacyMetadata.production_model_promotion_effect, 80) !== "NONE" ||
  text(legacyMetadata.paired_provider_job_id, 300) ||
  !text(legacyMetadata.baseline_provider_job_id, 300) ||
  !text(legacyMetadata.candidate_provider_job_id, 300)
) {
  throw new Error("BENCHMARK_RESUBMIT_RECOVERED_LEGACY_GOVERNANCE_INVALID");
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  event: "AVANTIQO_INTELLIGENCE_BENCHMARK_RESUBMISSION_PREFLIGHT",
  main_commit: mainCommit,
  recovered_legacy_run_id: legacyRun.id,
  recovered_legacy_status: text(legacyMetadata.status, 120),
  training_job_id: trainingJob.id,
  benchmark_suite_id: suite.id,
  case_count: readiness.case_count,
  candidate_count: readiness.candidate_count,
  example_count: readiness.example_count,
  safe_lease_lane: SAFE_LEASE_LANE,
  leased_endpoint_id: safeLease.endpointId,
  lease_expires_at: new Date(safeLease.expiresAt).toISOString(),
  provider_job_limit: 1,
  provider_jobs_submitted: 0,
  production_model_promoted: false,
  secrets_printed: false,
}, null, 2));

const submission = await submitAvantiqoModelBenchmark({
  trainingJobId: trainingJob.id,
  benchmarkSuiteId: suite.id,
  approved: true,
});
if (submission?.status !== "BENCHMARK_SUBMITTED") {
  throw new Error(`BENCHMARK_RESUBMIT_SUBMISSION_FAILED:${text(submission?.status, 120) || "UNKNOWN"}`);
}
const run = submission.run;
const runMetadata = object(run?.metadata);
const runId = text(run?.id, 200);
const pairedProviderJobId = text(runMetadata.paired_provider_job_id, 300);
if (
  !runId ||
  !pairedProviderJobId ||
  Number(runMetadata.provider_job_count || 0) !== 1 ||
  runMetadata.paired_single_job !== true ||
  submission?.governance?.one_job_per_lease_preserved !== true ||
  submission?.governance?.safe_lease_v2_required !== true ||
  submission?.governance?.automatic_model_promotion === true
) {
  throw new Error("BENCHMARK_RESUBMIT_PAIRED_SUBMISSION_GOVERNANCE_INVALID");
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  event: "AVANTIQO_INTELLIGENCE_BENCHMARK_PAIRED_JOB_SUBMITTED",
  benchmark_run_id: runId,
  provider_job_id: pairedProviderJobId,
  provider_jobs_submitted: 1,
  paired_baseline_candidate_execution: true,
  production_model_promoted: false,
  secrets_printed: false,
}, null, 2));

let terminal = null;
while (!terminal) {
  if (Date.now() + POLL_MS >= safeLease.expiresAt) {
    throw new Error("BENCHMARK_RESUBMIT_SAFE_LEASE_EXPIRY_BEFORE_TERMINAL_STATE");
  }
  await sleep(POLL_MS);
  const refreshed = await refreshAvantiqoModelBenchmark({ benchmarkRunId: runId });
  const status = text(refreshed?.status, 120);
  console.log(JSON.stringify({
    contract: CONTRACT,
    event: "AVANTIQO_INTELLIGENCE_BENCHMARK_RESUBMISSION_PROGRESS",
    status,
    provider_jobs_submitted: 1,
    lease_remaining_seconds: Math.max(0, Math.floor((safeLease.expiresAt - Date.now()) / 1000)),
    production_model_promoted: false,
    secrets_printed: false,
  }));
  if (TERMINAL.has(status)) terminal = refreshed;
}

if (terminal.status !== "BENCHMARK_COMPLETED") {
  throw new Error(`BENCHMARK_RESUBMIT_TERMINAL_FAILURE:${terminal.status}`);
}
if (
  terminal?.governance?.one_job_per_lease_preserved !== true ||
  terminal?.governance?.safe_lease_v2_required !== true ||
  terminal?.governance?.automatic_model_promotion === true
) {
  throw new Error("BENCHMARK_RESUBMIT_TERMINAL_GOVERNANCE_INVALID");
}

console.log("AVANTIQO_INTELLIGENCE_BENCHMARK_RESUBMISSION=BENCHMARK_COMPLETED");
console.log("AVANTIQO_INTELLIGENCE_BENCHMARK_RESUBMISSION_PROVIDER_JOB_COUNT=1");
console.log("AVANTIQO_INTELLIGENCE_BENCHMARK_RESUBMISSION_PRODUCTION_PROMOTION=NO");
console.log("AVANTIQO_INTELLIGENCE_BENCHMARK_RESUBMISSION_SECRETS_PRINTED=NO");
