import { spawnSync } from "node:child_process";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_MODEL_TRAINING_EXECUTION_LOCAL_V2";
const TRAINING_SCOPE = "platform_model_training_jobs";
const TRAINING_CONTRACT = "AVANTIQO_MODEL_IMPROVEMENT_V1";
const FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "intelligence-trainer";
const DEFAULT_TRAINER_WARMUP_RETRY_ATTEMPTS = 24;
const DEFAULT_TRAINER_WARMUP_RETRY_DELAY_MS = 3_000;
const DEFAULT_POLL_MS = 5_000;
const TERMINAL = new Set(["TRAINING_COMPLETED", "TRAINING_FAILED"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value, 40).toUpperCase());
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
  return /^AVANTIQO_SHARED_TRAINER_RESERVATION_(?:BLOCKED|CHANGED):avantiqo-intelligence-trainer-v1:TRAINER_RUNTIME_BUSY$/.test(message);
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
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_MODEL_TRAINING_GIT_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_MODEL_TRAINING_GIT_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_MODEL_TRAINING_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_MODEL_TRAINING_GIT_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_MODEL_TRAINING_GIT_REMOTE_FAILED");
  if (head !== remote) throw new Error(`AVANTIQO_MODEL_TRAINING_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  return head;
}

function requireSafeLease() {
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE, 40).toUpperCase() !== "YES") {
    throw new Error("AVANTIQO_MODEL_TRAINING_SAFE_LEASE_ACTIVE_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT, 120) !== SAFE_LEASE_CONTRACT) {
    throw new Error("AVANTIQO_MODEL_TRAINING_SAFE_LEASE_V2_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE, 120) !== SAFE_LEASE_LANE) {
    throw new Error("AVANTIQO_MODEL_TRAINING_SAFE_LEASE_LANE_REQUIRED");
  }
  const endpointId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID, 200);
  if (!/^[A-Za-z0-9_-]+$/.test(endpointId)) {
    throw new Error("AVANTIQO_MODEL_TRAINING_SAFE_LEASE_ENDPOINT_REQUIRED");
  }
  const expiresAt = Date.parse(text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT, 160));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error("AVANTIQO_MODEL_TRAINING_SAFE_LEASE_EXPIRY_REQUIRED");
  }
  return { endpointId, expiresAt };
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

const safeLease = requireSafeLease();
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID, 240);
if (!configuredEndpointId || configuredEndpointId !== safeLease.endpointId) {
  throw new Error("AVANTIQO_MODEL_TRAINING_LEASE_ENDPOINT_BINDING_REQUIRED");
}
const mainCommit = validateCurrentMain();
const queueApiKey = text(process.env.RUNPOD_API_KEY, 4000);
if (!queueApiKey) throw new Error("AVANTIQO_MODEL_TRAINING_RUNPOD_API_KEY_REQUIRED");
const configuredManagementApiKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY, 4000);
const managementApiKeySource = configuredManagementApiKey
  ? "RUNPOD_MANAGEMENT_API_KEY"
  : "RUNPOD_API_KEY_FALLBACK";
if (!configuredManagementApiKey) process.env.RUNPOD_MANAGEMENT_API_KEY = queueApiKey;

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));
const { ensureAvantiqoLearningOrganizationEnvironment } = await import(
  "@/lib/intelligence/runtime/AvantiqoLearningOrganizationRuntime"
);
const {
  submitAvantiqoModelTrainingJob,
  refreshAvantiqoModelTrainingJob,
} = await import("@/lib/intelligence/runtime/AvantiqoModelTrainingExecutionRuntime");
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
if (jobs.length === 0) throw new Error("AVANTIQO_MODEL_TRAINING_PREPARED_JOB_NOT_FOUND");
if (jobs.length !== 1) throw new Error(`AVANTIQO_MODEL_TRAINING_PREPARED_JOB_AMBIGUOUS:${jobs.length}`);
const job = jobs[0];
const metadata = job?.metadata && typeof job.metadata === "object" ? job.metadata : {};
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
const pollMs = boundedInteger(
  process.env.AVANTIQO_MODEL_TRAINING_POLL_MS,
  DEFAULT_POLL_MS,
  2_000,
  30_000,
);

console.log(JSON.stringify({
  contract: CONTRACT,
  event: "AVANTIQO_MODEL_TRAINING_PREFLIGHT",
  mode: "EXPLICIT_PAID_TRAINING_EXECUTION",
  main_commit: mainCommit,
  safe_lease_contract: SAFE_LEASE_CONTRACT,
  safe_lease_lane: SAFE_LEASE_LANE,
  leased_endpoint_binding_verified: true,
  lease_expires_at: new Date(safeLease.expiresAt).toISOString(),
  learning_organization_resolved: Boolean(organization.organization_id),
  training_job_subject: text(job.subject, 240),
  training_job_status: text(metadata.status, 80),
  foundation_model: text(metadata.foundation_model, 300),
  management_api_key_source: managementApiKeySource,
  transient_trainer_warmup_retry_attempts: warmupRetryAttempts,
  transient_trainer_warmup_retry_delay_ms: warmupRetryDelayMs,
  poll_ms: pollMs,
  provider_jobs_submitted: 0,
  production_model_promoted: false,
  secrets_printed: false,
}, null, 2));

let result = null;
for (let attempt = 1; attempt <= warmupRetryAttempts; attempt += 1) {
  if (Date.now() + warmupRetryDelayMs >= safeLease.expiresAt) {
    throw new Error("AVANTIQO_MODEL_TRAINING_SAFE_LEASE_EXPIRY_DURING_WARMUP");
  }
  try {
    result = await submitAvantiqoModelTrainingJob({ trainingJobId: job.id, approved: true });
    break;
  } catch (error) {
    if (!transientTrainerWarmupGuardError(error) || attempt >= warmupRetryAttempts) throw error;
    console.log(JSON.stringify({
      contract: CONTRACT,
      event: "AVANTIQO_MODEL_TRAINING_TRANSIENT_WARMUP",
      attempt,
      max_attempts: warmupRetryAttempts,
      retry_delay_ms: warmupRetryDelayMs,
      provider_jobs_submitted: 0,
      production_model_promoted: false,
      secrets_printed: false,
    }));
    await sleep(warmupRetryDelayMs);
  }
}

if (!result || result.status !== "TRAINING_SUBMITTED") {
  throw new Error(`AVANTIQO_MODEL_TRAINING_SUBMISSION_FAILED:${text(result?.status, 120) || "UNKNOWN"}`);
}
const governance = result?.governance && typeof result.governance === "object" ? result.governance : {};
if (
  governance.safe_lease_v2_required !== true ||
  governance.leased_endpoint_binding_verified !== true ||
  governance.live_training_readiness_verified !== true ||
  governance.certified_trainer_image_binding_verified !== true ||
  governance.shared_trainer_exclusive_reservation_verified !== true ||
  governance.code_or_intelligence_reservation_present === true
) {
  throw new Error("AVANTIQO_MODEL_TRAINING_SUBMISSION_GOVERNANCE_ASSERTION_FAILED");
}

console.log(JSON.stringify({
  contract: CONTRACT,
  event: "AVANTIQO_MODEL_TRAINING_SUBMITTED",
  provider_job_id: text(result.provider_job_id, 240),
  provider_jobs_submitted: 1,
  safe_lease_lane: governance.safe_lease_lane,
  production_model_promoted: false,
  secrets_printed: false,
}, null, 2));

let terminal = null;
while (!terminal) {
  if (Date.now() + pollMs >= safeLease.expiresAt) {
    throw new Error("AVANTIQO_MODEL_TRAINING_SAFE_LEASE_EXPIRY_BEFORE_TERMINAL_STATE");
  }
  await sleep(pollMs);
  const refreshed = await refreshAvantiqoModelTrainingJob({ trainingJobId: job.id });
  const status = text(refreshed?.status, 120);
  console.log(JSON.stringify({
    contract: CONTRACT,
    event: "AVANTIQO_MODEL_TRAINING_PROGRESS",
    status,
    provider_jobs_submitted: 1,
    lease_remaining_seconds: Math.max(0, Math.floor((safeLease.expiresAt - Date.now()) / 1000)),
    production_model_promoted: false,
    secrets_printed: false,
  }));
  if (TERMINAL.has(status)) terminal = refreshed;
}

if (terminal.status !== "TRAINING_COMPLETED") {
  throw new Error(`AVANTIQO_MODEL_TRAINING_TERMINAL_FAILURE:${terminal.status}`);
}
if (
  terminal?.governance?.safe_lease_v2_required !== true ||
  terminal?.governance?.leased_endpoint_binding_verified !== true ||
  terminal?.governance?.foundation_weights_mutated !== false ||
  terminal?.governance?.production_model_promoted !== false
) {
  throw new Error("AVANTIQO_MODEL_TRAINING_TERMINAL_GOVERNANCE_ASSERTION_FAILED");
}

console.log("AVANTIQO_MODEL_TRAINING_EXECUTION=TRAINING_COMPLETED");
console.log("AVANTIQO_MODEL_TRAINING_PROVIDER_JOB_COUNT=1");
console.log("AVANTIQO_MODEL_TRAINING_FOUNDATION_WEIGHTS_MUTATED=NO");
console.log("AVANTIQO_MODEL_TRAINING_PRODUCTION_PROMOTION=NO");
console.log("AVANTIQO_MODEL_TRAINING_SECRETS_PRINTED=NO");