import { spawnSync } from "node:child_process";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_MODEL_TRAINING_EXECUTION_LOCAL_V1";
const TRAINING_SCOPE = "platform_model_training_jobs";
const TRAINING_CONTRACT = "AVANTIQO_MODEL_IMPROVEMENT_V1";
const FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const DEFAULT_TRAINER_WARMUP_RETRY_ATTEMPTS = 24;
const DEFAULT_TRAINER_WARMUP_RETRY_DELAY_MS = 3_000;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(
    text(value, 40).toUpperCase(),
  );
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function transientTrainerWarmupGuardError(error) {
  const message = text(error?.message || error, 2000);
  return (
    /^AVANTIQO_SHARED_TRAINER_RESERVATION_(?:BLOCKED|CHANGED):avantiqo-intelligence-trainer-v1:TRAINER_RUNTIME_BUSY$/.test(
      message,
    )
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
    "AVANTIQO_MODEL_TRAINING_EXECUTION_GIT_FETCH_FAILED",
  );
  const branch = shell(
    "git",
    ["branch", "--show-current"],
    "AVANTIQO_MODEL_TRAINING_EXECUTION_GIT_BRANCH_FAILED",
  );
  if (branch !== "main") {
    throw new Error(
      `AVANTIQO_MODEL_TRAINING_EXECUTION_MAIN_REQUIRED:${branch || "DETACHED"}`,
    );
  }
  const head = shell(
    "git",
    ["rev-parse", "HEAD"],
    "AVANTIQO_MODEL_TRAINING_EXECUTION_GIT_HEAD_FAILED",
  );
  const remote = shell(
    "git",
    ["rev-parse", "origin/main"],
    "AVANTIQO_MODEL_TRAINING_EXECUTION_GIT_REMOTE_FAILED",
  );
  if (head !== remote) {
    throw new Error(
      `AVANTIQO_MODEL_TRAINING_EXECUTION_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`,
    );
  }
  return head;
}

if (!yes(process.env.AVANTIQO_MODEL_TRAINING_EXECUTION_APPROVED)) {
  throw new Error("AVANTIQO_MODEL_TRAINING_EXECUTION_APPROVED=YES_REQUIRED");
}
if (!yes(process.env.AVANTIQO_INTELLIGENCE_TRAINER_ENABLED)) {
  throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_ENABLED=YES_REQUIRED");
}
if (text(process.env.NODE_ENV, 40).toLowerCase() !== "development") {
  throw new Error("AVANTIQO_MODEL_TRAINING_EXECUTION_DEVELOPMENT_ENV_REQUIRED");
}

const mainCommit = validateCurrentMain();

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const {
  ensureAvantiqoLearningOrganizationEnvironment,
} = await import(
  "@/lib/intelligence/runtime/AvantiqoLearningOrganizationRuntime"
);
const {
  submitAvantiqoModelTrainingJob,
} = await import(
  "@/lib/intelligence/runtime/AvantiqoModelTrainingExecutionRuntime"
);
const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");

const organization = await ensureAvantiqoLearningOrganizationEnvironment();
const jobResult = await supabaseAdmin
  .from("intelligence_memories")
  .select("id,subject,metadata,updated_at")
  .eq("organization_id", organization.organization_id)
  .eq("memory_scope", TRAINING_SCOPE)
  .eq("active", true)
  .eq("metadata->>contract", TRAINING_CONTRACT)
  .eq("metadata->>status", "PREPARED")
  .eq("metadata->>training_execution_authorized", "false")
  .eq("metadata->>foundation_model", FOUNDATION_MODEL)
  .order("updated_at", { ascending: false })
  .limit(3);
if (jobResult.error) throw jobResult.error;

const jobs = Array.isArray(jobResult.data) ? jobResult.data : [];
if (jobs.length === 0) {
  throw new Error("AVANTIQO_MODEL_TRAINING_EXECUTION_PREPARED_JOB_NOT_FOUND");
}
if (jobs.length !== 1) {
  throw new Error(
    `AVANTIQO_MODEL_TRAINING_EXECUTION_PREPARED_JOB_AMBIGUOUS:${jobs.length}`,
  );
}
const job = jobs[0];
const metadata = job?.metadata && typeof job.metadata === "object"
  ? job.metadata
  : {};
const warmupRetryAttempts = boundedInteger(
  process.env.AVANTIQO_MODEL_TRAINING_WARMUP_RETRY_ATTEMPTS,
  DEFAULT_TRAINER_WARMUP_RETRY_ATTEMPTS,
  1,
  60,
);
const warmupRetryDelayMs = boundedInteger(
  process.env.AVANTIQO_MODEL_TRAINING_WARMUP_RETRY_DELAY_MS,
  DEFAULT_TRAINER_WARMUP_RETRY_DELAY_MS,
  1_000,
  10_000,
);

console.log(JSON.stringify({
  contract: CONTRACT,
  event: "AVANTIQO_MODEL_TRAINING_EXECUTION_PREFLIGHT",
  mode: "EXPLICIT_PAID_TRAINING_EXECUTION",
  main_commit: mainCommit,
  learning_organization_resolved: Boolean(organization.organization_id),
  learning_organization_source: organization.source,
  training_job_subject: text(job.subject, 240),
  training_job_status: text(metadata.status, 80),
  foundation_model: text(metadata.foundation_model, 300),
  dataset_fingerprint: text(metadata.dataset_fingerprint, 128) || null,
  example_fingerprint: text(metadata.example_fingerprint, 128) || null,
  train_example_count: Array.isArray(metadata.train_example_ids)
    ? metadata.train_example_ids.length
    : null,
  holdout_example_count: Array.isArray(metadata.holdout_example_ids)
    ? metadata.holdout_example_ids.length
    : null,
  explicit_execution_approval_observed: true,
  trainer_enabled: true,
  transient_trainer_warmup_retry_attempts: warmupRetryAttempts,
  transient_trainer_warmup_retry_delay_ms: warmupRetryDelayMs,
  provider_job_submitted: false,
  model_weight_mutation_started: false,
  production_deploy_performed: false,
  production_model_promoted: false,
  secrets_printed: false,
}, null, 2));

let result = null;
for (let attempt = 1; attempt <= warmupRetryAttempts; attempt += 1) {
  try {
    result = await submitAvantiqoModelTrainingJob({
      trainingJobId: job.id,
      approved: true,
    });
    break;
  } catch (error) {
    if (
      !transientTrainerWarmupGuardError(error) ||
      attempt >= warmupRetryAttempts
    ) {
      throw error;
    }
    console.log(JSON.stringify({
      contract: CONTRACT,
      event: "AVANTIQO_MODEL_TRAINING_EXECUTION_TRANSIENT_TRAINER_WARMUP",
      success: true,
      attempt,
      max_attempts: warmupRetryAttempts,
      retry_delay_ms: warmupRetryDelayMs,
      reason: "TRAINER_RUNTIME_BUSY_WITHOUT_JOB_OR_PEER_BLOCKER",
      provider_job_submitted: false,
      queue_mutation_performed: false,
      production_deploy_performed: false,
      secrets_printed: false,
    }, null, 2));
    await sleep(warmupRetryDelayMs);
  }
}

if (!result) {
  throw new Error("AVANTIQO_MODEL_TRAINING_EXECUTION_RESULT_REQUIRED");
}

const resultMetadata = result?.job?.metadata &&
  typeof result.job.metadata === "object"
  ? result.job.metadata
  : {};
const governance = result?.governance && typeof result.governance === "object"
  ? result.governance
  : {};

console.log(JSON.stringify({
  contract: CONTRACT,
  event: "AVANTIQO_MODEL_TRAINING_EXECUTION_SUBMITTED",
  success: result?.status === "TRAINING_SUBMITTED",
  runtime_contract: result?.contract || null,
  status: result?.status || null,
  training_job_subject: text(result?.job?.subject || job.subject, 240),
  training_job_status: text(resultMetadata.status, 80) || null,
  provider_job_id: text(result?.provider_job_id, 240) || null,
  dataset_fingerprint: text(
    resultMetadata?.readiness_certification?.dataset_fingerprint ||
      resultMetadata.dataset_fingerprint,
    128,
  ) || null,
  example_fingerprint: text(
    resultMetadata?.readiness_certification?.example_fingerprint ||
      resultMetadata.example_fingerprint,
    128,
  ) || null,
  readiness_status: text(
    resultMetadata?.readiness_certification?.status,
    120,
  ) || null,
  explicit_execution_approval_observed:
    governance.explicit_execution_approval_observed === true,
  live_training_readiness_verified:
    governance.live_training_readiness_verified === true,
  current_dataset_binding_verified:
    governance.current_dataset_binding_verified === true,
  current_candidate_source_versions_verified:
    governance.current_candidate_source_versions_verified === true,
  current_candidate_benchmarks_verified:
    governance.current_candidate_benchmarks_verified === true,
  current_example_bindings_verified:
    governance.current_example_bindings_verified === true,
  certified_trainer_image_binding_verified:
    governance.certified_trainer_image_binding_verified === true,
  shared_trainer_exclusive_reservation_verified:
    governance.shared_trainer_exclusive_reservation_verified === true,
  shared_trainer_stable_observations: Number(
    governance.shared_trainer_stable_observations || 0,
  ),
  code_or_intelligence_reservation_present:
    governance.code_or_intelligence_reservation_present === true,
  automatic_production_promotion:
    governance.automatic_production_promotion === true,
  production_model_promotion_effect:
    governance.production_model_promotion_effect || "NONE",
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

if (result?.status !== "TRAINING_SUBMITTED") {
  throw new Error(
    `AVANTIQO_MODEL_TRAINING_EXECUTION_SUBMISSION_FAILED:${text(result?.status, 120) || "UNKNOWN"}`,
  );
}
if (
  governance.live_training_readiness_verified !== true ||
  governance.certified_trainer_image_binding_verified !== true ||
  governance.shared_trainer_exclusive_reservation_verified !== true ||
  governance.code_or_intelligence_reservation_present === true
) {
  throw new Error("AVANTIQO_MODEL_TRAINING_EXECUTION_GOVERNANCE_ASSERTION_FAILED");
}

console.log("AVANTIQO_MODEL_TRAINING_EXECUTION=TRAINING_SUBMITTED");
console.log("AVANTIQO_MODEL_TRAINING_EXECUTION_PRODUCTION_PROMOTION=NO");
console.log("AVANTIQO_MODEL_TRAINING_EXECUTION_SECRETS_PRINTED=NO");