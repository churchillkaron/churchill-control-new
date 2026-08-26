import { spawnSync } from "node:child_process";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_MODEL_BENCHMARK_SUBMISSION_LOCAL_V1";
const TRAINING_SCOPE = "platform_model_training_jobs";
const BENCHMARK_SUITE_SCOPE = "platform_model_benchmark_suites";
const BENCHMARK_RUN_SCOPE = "platform_model_benchmark_runs";
const TRAINING_CONTRACT = "AVANTIQO_MODEL_IMPROVEMENT_V1";
const BENCHMARK_SUITE_CONTRACT = "AVANTIQO_MODEL_BENCHMARK_SUITE_V1";
const FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const ACTIVE_BENCHMARK_STATUSES = new Set([
  "BENCHMARK_SUBMITTED",
  "BENCHMARK_RUNNING",
]);
const TERMINAL_BENCHMARK_STATUSES = new Set([
  "BENCHMARK_COMPLETED",
  "BENCHMARK_FAILED",
  "BENCHMARK_STALE",
]);

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

function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(
    text(value, 40).toUpperCase(),
  );
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
  shell(
    "git",
    ["fetch", "origin", "main"],
    "AVANTIQO_MODEL_BENCHMARK_SUBMISSION_GIT_FETCH_FAILED",
  );
  const branch = shell(
    "git",
    ["branch", "--show-current"],
    "AVANTIQO_MODEL_BENCHMARK_SUBMISSION_GIT_BRANCH_FAILED",
  );
  if (branch !== "main") {
    throw new Error(
      `AVANTIQO_MODEL_BENCHMARK_SUBMISSION_MAIN_REQUIRED:${branch || "DETACHED"}`,
    );
  }
  const head = shell(
    "git",
    ["rev-parse", "HEAD"],
    "AVANTIQO_MODEL_BENCHMARK_SUBMISSION_GIT_HEAD_FAILED",
  );
  const remote = shell(
    "git",
    ["rev-parse", "origin/main"],
    "AVANTIQO_MODEL_BENCHMARK_SUBMISSION_GIT_REMOTE_FAILED",
  );
  if (head !== remote) {
    throw new Error(
      `AVANTIQO_MODEL_BENCHMARK_SUBMISSION_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`,
    );
  }
  return head;
}

if (!yes(process.env.AVANTIQO_MODEL_BENCHMARK_EXECUTION_APPROVED)) {
  throw new Error("AVANTIQO_MODEL_BENCHMARK_EXECUTION_APPROVED=YES_REQUIRED");
}
if (!yes(process.env.AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED)) {
  throw new Error("AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED=YES_REQUIRED");
}
if (text(process.env.NODE_ENV, 40).toLowerCase() !== "development") {
  throw new Error("AVANTIQO_MODEL_BENCHMARK_SUBMISSION_DEVELOPMENT_ENV_REQUIRED");
}
if (!text(process.env.RUNPOD_API_KEY, 4000)) {
  throw new Error("AVANTIQO_MODEL_BENCHMARK_SUBMISSION_RUNPOD_API_KEY_REQUIRED");
}
if (!text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_BENCHMARK_ENDPOINT_ID, 240)) {
  throw new Error(
    "AVANTIQO_MODEL_BENCHMARK_SUBMISSION_BENCHMARK_ENDPOINT_ID_REQUIRED",
  );
}

const mainCommit = validateCurrentMain();

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const {
  ensureAvantiqoLearningOrganizationEnvironment,
} = await import(
  "@/lib/intelligence/runtime/AvantiqoLearningOrganizationRuntime"
);
const {
  submitAvantiqoModelBenchmark,
} = await import(
  "@/lib/intelligence/runtime/AvantiqoModelBenchmarkExecutionRuntime"
);
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
  throw new Error(
    `AVANTIQO_MODEL_BENCHMARK_SUBMISSION_TRAINING_JOB_RESOLUTION_FAILED:${trainingJobs.length}`,
  );
}
const trainingJob = trainingJobs[0];
const trainingMetadata = object(trainingJob.metadata);
const adapterArtifactReference = text(
  trainingMetadata.adapter_artifact_reference,
  1000,
);
if (!adapterArtifactReference.startsWith(
  "/runpod-volume/avantiqo-intelligence-training/",
)) {
  throw new Error(
    "AVANTIQO_MODEL_BENCHMARK_SUBMISSION_TRAINING_ADAPTER_INVALID",
  );
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
  throw new Error(
    `AVANTIQO_MODEL_BENCHMARK_SUBMISSION_SUITE_RESOLUTION_FAILED:${suites.length}`,
  );
}
const suite = suites[0];
const suiteMetadata = object(suite.metadata);
const cases = list(suiteMetadata.cases);
if (cases.length !== 60) {
  throw new Error(
    `AVANTIQO_MODEL_BENCHMARK_SUBMISSION_CASE_COUNT_MISMATCH:${cases.length}`,
  );
}

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
const activeRuns = existingRuns.filter((row) =>
  ACTIVE_BENCHMARK_STATUSES.has(text(object(row.metadata).status, 80)),
);
if (activeRuns.length > 1) {
  throw new Error(
    `AVANTIQO_MODEL_BENCHMARK_SUBMISSION_ACTIVE_RUN_AMBIGUOUS:${activeRuns.length}`,
  );
}

console.log(JSON.stringify({
  contract: CONTRACT,
  event: "AVANTIQO_MODEL_BENCHMARK_SUBMISSION_PREFLIGHT",
  main_commit: mainCommit,
  learning_organization_resolved: Boolean(organization.organization_id),
  learning_organization_source: organization.source,
  training_job_subject: text(trainingJob.subject, 240),
  training_job_status: text(trainingMetadata.status, 80),
  adapter_artifact_reference: adapterArtifactReference,
  benchmark_suite_subject: text(suite.subject, 240),
  benchmark_suite_fingerprint: text(suiteMetadata.suite_fingerprint, 128) || null,
  case_count: cases.length,
  existing_benchmark_run_count: existingRuns.length,
  active_benchmark_run_count: activeRuns.length,
  explicit_execution_approval_observed: true,
  benchmark_enabled: true,
  provider_jobs_submitted_by_this_process: 0,
  production_deploy_performed: false,
  production_model_promoted: false,
  secrets_printed: false,
}, null, 2));

if (activeRuns.length === 1) {
  const existing = activeRuns[0];
  const metadata = object(existing.metadata);
  console.log(JSON.stringify({
    contract: CONTRACT,
    event: "AVANTIQO_MODEL_BENCHMARK_ALREADY_ACTIVE",
    success: true,
    status: text(metadata.status, 80),
    benchmark_run_subject: text(existing.subject, 240),
    baseline_provider_job_id: text(metadata.baseline_provider_job_id, 240) || null,
    candidate_provider_job_id: text(metadata.candidate_provider_job_id, 240) || null,
    provider_jobs_submitted_by_this_process: 0,
    automatic_model_promotion: false,
    production_model_promotion_effect: "NONE",
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
  console.log("AVANTIQO_MODEL_BENCHMARK_SUBMISSION=EXISTING_RUN_REUSED");
  process.exit(0);
}

const latestExisting = existingRuns[0] || null;
if (latestExisting) {
  const existingStatus = text(object(latestExisting.metadata).status, 80);
  if (TERMINAL_BENCHMARK_STATUSES.has(existingStatus)) {
    throw new Error(
      `AVANTIQO_MODEL_BENCHMARK_SUBMISSION_TERMINAL_RUN_ALREADY_EXISTS:${existingStatus}`,
    );
  }
  throw new Error(
    `AVANTIQO_MODEL_BENCHMARK_SUBMISSION_UNKNOWN_EXISTING_RUN_STATUS:${existingStatus || "UNKNOWN"}`,
  );
}

const submission = await submitAvantiqoModelBenchmark({
  trainingJobId: trainingJob.id,
  benchmarkSuiteId: suite.id,
  approved: true,
});
const runMetadata = object(submission?.run?.metadata);

console.log(JSON.stringify({
  contract: CONTRACT,
  event: "AVANTIQO_MODEL_BENCHMARK_SUBMITTED",
  success: submission?.status === "BENCHMARK_SUBMITTED",
  runtime_contract: submission?.contract || null,
  status: submission?.status || null,
  benchmark_run_subject: text(submission?.run?.subject, 240) || null,
  baseline_provider_job_id: text(runMetadata.baseline_provider_job_id, 240) || null,
  candidate_provider_job_id: text(runMetadata.candidate_provider_job_id, 240) || null,
  case_count: cases.length,
  matched_prompt_set: runMetadata.matched_prompt_set === true,
  current_training_artifacts_verified:
    submission?.governance?.current_training_artifacts_verified === true,
  current_benchmark_suite_binding_verified:
    submission?.governance?.current_benchmark_suite_binding_verified === true,
  candidate_did_not_grade_itself:
    submission?.governance?.candidate_did_not_grade_itself === true,
  provider_jobs_submitted_by_this_process: 2,
  automatic_model_promotion:
    submission?.governance?.automatic_model_promotion === true,
  production_model_promotion_effect:
    submission?.governance?.production_model_promotion_effect || "NONE",
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

if (submission?.status !== "BENCHMARK_SUBMITTED") {
  throw new Error(
    `AVANTIQO_MODEL_BENCHMARK_SUBMISSION_FAILED:${text(submission?.status, 120) || "UNKNOWN"}`,
  );
}
if (
  !text(runMetadata.baseline_provider_job_id, 240) ||
  !text(runMetadata.candidate_provider_job_id, 240)
) {
  throw new Error("AVANTIQO_MODEL_BENCHMARK_SUBMISSION_PROVIDER_JOB_IDS_REQUIRED");
}
if (
  submission?.governance?.current_training_artifacts_verified !== true ||
  submission?.governance?.current_benchmark_suite_binding_verified !== true ||
  submission?.governance?.candidate_did_not_grade_itself !== true ||
  submission?.governance?.automatic_model_promotion === true
) {
  throw new Error("AVANTIQO_MODEL_BENCHMARK_SUBMISSION_GOVERNANCE_ASSERTION_FAILED");
}

console.log("AVANTIQO_MODEL_BENCHMARK_SUBMISSION=BENCHMARK_SUBMITTED");
console.log("AVANTIQO_MODEL_BENCHMARK_SUBMISSION_PRODUCTION_PROMOTION=NO");
console.log("AVANTIQO_MODEL_BENCHMARK_SUBMISSION_SECRETS_PRINTED=NO");
