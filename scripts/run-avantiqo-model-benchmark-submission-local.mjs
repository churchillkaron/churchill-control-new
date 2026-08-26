import { spawnSync } from "node:child_process";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_MODEL_BENCHMARK_SUBMISSION_LOCAL_V2";
const TRAINING_SCOPE = "platform_model_training_jobs";
const BENCHMARK_SUITE_SCOPE = "platform_model_benchmark_suites";
const BENCHMARK_RUN_SCOPE = "platform_model_benchmark_runs";
const TRAINING_CONTRACT = "AVANTIQO_MODEL_IMPROVEMENT_V1";
const BENCHMARK_SUITE_CONTRACT = "AVANTIQO_MODEL_BENCHMARK_SUITE_V1";
const FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "intelligence-benchmark";
const POLL_MS = 5000;
const TERMINAL_BENCHMARK_STATUSES = new Set([
  "BENCHMARK_COMPLETED",
  "BENCHMARK_FAILED",
  "BENCHMARK_STALE",
]);

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

function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout, 800)}`);
  }
  return text(result.stdout, 1000);
}

function validateCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_MODEL_BENCHMARK_GIT_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_MODEL_BENCHMARK_GIT_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_MODEL_BENCHMARK_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_MODEL_BENCHMARK_GIT_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_MODEL_BENCHMARK_GIT_REMOTE_FAILED");
  if (head !== remote) throw new Error(`AVANTIQO_MODEL_BENCHMARK_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  return head;
}

function requireSafeLease() {
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE, 40).toUpperCase() !== "YES") {
    throw new Error("AVANTIQO_MODEL_BENCHMARK_SAFE_LEASE_ACTIVE_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT, 120) !== SAFE_LEASE_CONTRACT) {
    throw new Error("AVANTIQO_MODEL_BENCHMARK_SAFE_LEASE_V2_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE, 120) !== SAFE_LEASE_LANE) {
    throw new Error("AVANTIQO_MODEL_BENCHMARK_SAFE_LEASE_LANE_REQUIRED");
  }
  const endpointId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID, 200);
  if (!/^[A-Za-z0-9_-]+$/.test(endpointId)) {
    throw new Error("AVANTIQO_MODEL_BENCHMARK_SAFE_LEASE_ENDPOINT_REQUIRED");
  }
  const expiresAt = Date.parse(text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT, 160));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error("AVANTIQO_MODEL_BENCHMARK_SAFE_LEASE_EXPIRY_REQUIRED");
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
  throw new Error("AVANTIQO_MODEL_BENCHMARK_DEVELOPMENT_ENV_REQUIRED");
}
if (!text(process.env.RUNPOD_API_KEY, 4000)) {
  throw new Error("AVANTIQO_MODEL_BENCHMARK_RUNPOD_API_KEY_REQUIRED");
}

const safeLease = requireSafeLease();
const configuredEndpointId = text(
  process.env.RUNPOD_AVANTIQO_INTELLIGENCE_BENCHMARK_ENDPOINT_ID ||
    process.env.RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID,
  240,
);
if (!configuredEndpointId || configuredEndpointId !== safeLease.endpointId) {
  throw new Error("AVANTIQO_MODEL_BENCHMARK_LEASE_ENDPOINT_BINDING_REQUIRED");
}
const mainCommit = validateCurrentMain();

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));
const { ensureAvantiqoLearningOrganizationEnvironment } = await import(
  "@/lib/intelligence/runtime/AvantiqoLearningOrganizationRuntime"
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
  throw new Error(`AVANTIQO_MODEL_BENCHMARK_TRAINING_JOB_RESOLUTION_FAILED:${trainingJobs.length}`);
}
const trainingJob = trainingJobs[0];
const trainingMetadata = object(trainingJob.metadata);
const adapterArtifactReference = text(trainingMetadata.adapter_artifact_reference, 1000);
if (!adapterArtifactReference.startsWith("/runpod-volume/avantiqo-intelligence-training/")) {
  throw new Error("AVANTIQO_MODEL_BENCHMARK_TRAINING_ADAPTER_INVALID");
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
if (suites.length !== 1) {
  throw new Error(`AVANTIQO_MODEL_BENCHMARK_SUITE_RESOLUTION_FAILED:${suites.length}`);
}
const suite = suites[0];
const cases = list(object(suite.metadata).cases);
if (cases.length !== 60) throw new Error(`AVANTIQO_MODEL_BENCHMARK_CASE_COUNT_MISMATCH:${cases.length}`);

const existingRunResult = await supabaseAdmin
  .from("intelligence_memories")
  .select("id,subject,metadata,updated_at")
  .eq("organization_id", organization.organization_id)
  .eq("memory_scope", BENCHMARK_RUN_SCOPE)
  .eq("active", true)
  .eq("metadata->>training_job_id", trainingJob.id)
  .eq("metadata->>benchmark_suite_id", suite.id)
  .order("updated_at", { ascending: false })
  .limit(10);
if (existingRunResult.error) throw existingRunResult.error;
const existingRuns = list(existingRunResult.data);
if (existingRuns.length) {
  const status = text(object(existingRuns[0].metadata).status, 80);
  throw new Error(`AVANTIQO_MODEL_BENCHMARK_EXISTING_RUN_REQUIRES_RECONCILIATION:${status || "UNKNOWN"}`);
}

console.log(JSON.stringify({
  contract: CONTRACT,
  event: "AVANTIQO_MODEL_BENCHMARK_PREFLIGHT",
  main_commit: mainCommit,
  safe_lease_contract: SAFE_LEASE_CONTRACT,
  safe_lease_lane: SAFE_LEASE_LANE,
  leased_endpoint_binding_verified: true,
  lease_expires_at: new Date(safeLease.expiresAt).toISOString(),
  training_job_subject: text(trainingJob.subject, 240),
  benchmark_suite_subject: text(suite.subject, 240),
  case_count: cases.length,
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
  throw new Error(`AVANTIQO_MODEL_BENCHMARK_SUBMISSION_FAILED:${text(submission?.status, 120) || "UNKNOWN"}`);
}
const runId = text(submission?.run?.id, 160);
const runMetadata = object(submission?.run?.metadata);
if (!runId || !text(runMetadata.paired_provider_job_id, 240)) {
  throw new Error("AVANTIQO_MODEL_BENCHMARK_PAIRED_RUN_BINDING_REQUIRED");
}
if (
  Number(runMetadata.provider_job_count || 0) !== 1 ||
  submission?.governance?.one_job_per_lease_preserved !== true ||
  submission?.governance?.safe_lease_v2_required !== true
) {
  throw new Error("AVANTIQO_MODEL_BENCHMARK_SAFE_LEASE_SUBMISSION_INVARIANT_FAILED");
}

console.log(JSON.stringify({
  contract: CONTRACT,
  event: "AVANTIQO_MODEL_BENCHMARK_SUBMITTED",
  benchmark_run_id: runId,
  provider_job_id: text(runMetadata.paired_provider_job_id, 240),
  provider_jobs_submitted: 1,
  paired_baseline_candidate_execution: true,
  production_model_promoted: false,
  secrets_printed: false,
}, null, 2));

let terminal = null;
while (!terminal) {
  if (Date.now() + POLL_MS >= safeLease.expiresAt) {
    throw new Error("AVANTIQO_MODEL_BENCHMARK_SAFE_LEASE_EXPIRY_BEFORE_TERMINAL_STATE");
  }
  await sleep(POLL_MS);
  const refreshed = await refreshAvantiqoModelBenchmark({ benchmarkRunId: runId });
  const status = text(refreshed?.status, 120);
  console.log(JSON.stringify({
    contract: CONTRACT,
    event: "AVANTIQO_MODEL_BENCHMARK_PROGRESS",
    status,
    provider_jobs_submitted: 1,
    lease_remaining_seconds: Math.max(0, Math.floor((safeLease.expiresAt - Date.now()) / 1000)),
    production_model_promoted: false,
    secrets_printed: false,
  }));
  if (TERMINAL_BENCHMARK_STATUSES.has(status)) terminal = refreshed;
}

if (terminal.status !== "BENCHMARK_COMPLETED") {
  throw new Error(`AVANTIQO_MODEL_BENCHMARK_TERMINAL_FAILURE:${terminal.status}`);
}
if (
  terminal?.governance?.one_job_per_lease_preserved !== true ||
  terminal?.governance?.safe_lease_v2_required !== true ||
  terminal?.governance?.automatic_model_promotion === true
) {
  throw new Error("AVANTIQO_MODEL_BENCHMARK_TERMINAL_GOVERNANCE_ASSERTION_FAILED");
}

console.log("AVANTIQO_MODEL_BENCHMARK_EXECUTION=BENCHMARK_COMPLETED");
console.log("AVANTIQO_MODEL_BENCHMARK_PROVIDER_JOB_COUNT=1");
console.log("AVANTIQO_MODEL_BENCHMARK_PRODUCTION_PROMOTION=NO");
console.log("AVANTIQO_MODEL_BENCHMARK_SECRETS_PRINTED=NO");