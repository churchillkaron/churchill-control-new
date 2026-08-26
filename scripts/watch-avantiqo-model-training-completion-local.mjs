import { spawnSync } from "node:child_process";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_MODEL_TRAINING_COMPLETION_WATCH_V1";
const TRAINING_SCOPE = "platform_model_training_jobs";
const TRAINING_CONTRACT = "AVANTIQO_MODEL_IMPROVEMENT_V1";
const FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const ACTIVE_STATUSES = new Set([
  "TRAINING_SUBMITTED",
  "TRAINING_QUEUED",
  "TRAINING_RUNNING",
]);
const TERMINAL_STATUSES = new Set([
  "TRAINING_COMPLETED",
  "TRAINING_FAILED",
]);
const DEFAULT_POLL_INTERVAL_MS = 10_000;
const DEFAULT_MAX_POLLS = 720;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
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
    "AVANTIQO_MODEL_TRAINING_WATCH_GIT_FETCH_FAILED",
  );
  const branch = shell(
    "git",
    ["branch", "--show-current"],
    "AVANTIQO_MODEL_TRAINING_WATCH_GIT_BRANCH_FAILED",
  );
  if (branch !== "main") {
    throw new Error(
      `AVANTIQO_MODEL_TRAINING_WATCH_MAIN_REQUIRED:${branch || "DETACHED"}`,
    );
  }
  const head = shell(
    "git",
    ["rev-parse", "HEAD"],
    "AVANTIQO_MODEL_TRAINING_WATCH_GIT_HEAD_FAILED",
  );
  const remote = shell(
    "git",
    ["rev-parse", "origin/main"],
    "AVANTIQO_MODEL_TRAINING_WATCH_GIT_REMOTE_FAILED",
  );
  if (head !== remote) {
    throw new Error(
      `AVANTIQO_MODEL_TRAINING_WATCH_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`,
    );
  }
  return head;
}

if (!yes(process.env.AVANTIQO_INTELLIGENCE_TRAINER_ENABLED)) {
  throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_ENABLED=YES_REQUIRED");
}
if (text(process.env.NODE_ENV, 40).toLowerCase() !== "development") {
  throw new Error("AVANTIQO_MODEL_TRAINING_WATCH_DEVELOPMENT_ENV_REQUIRED");
}

const mainCommit = validateCurrentMain();
const queueApiKey = text(process.env.RUNPOD_API_KEY, 4000);
if (!queueApiKey) {
  throw new Error("AVANTIQO_MODEL_TRAINING_WATCH_RUNPOD_API_KEY_REQUIRED");
}
const configuredManagementApiKey = text(
  process.env.RUNPOD_MANAGEMENT_API_KEY,
  4000,
);
if (!configuredManagementApiKey) {
  process.env.RUNPOD_MANAGEMENT_API_KEY = queueApiKey;
}
const managementApiKeySource = configuredManagementApiKey
  ? "RUNPOD_MANAGEMENT_API_KEY"
  : "RUNPOD_API_KEY_FALLBACK";

const pollIntervalMs = boundedInteger(
  process.env.AVANTIQO_MODEL_TRAINING_WATCH_POLL_INTERVAL_MS,
  DEFAULT_POLL_INTERVAL_MS,
  2_000,
  60_000,
);
const maxPolls = boundedInteger(
  process.env.AVANTIQO_MODEL_TRAINING_WATCH_MAX_POLLS,
  DEFAULT_MAX_POLLS,
  1,
  2_000,
);

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const {
  ensureAvantiqoLearningOrganizationEnvironment,
} = await import(
  "@/lib/intelligence/runtime/AvantiqoLearningOrganizationRuntime"
);
const {
  refreshAvantiqoModelTrainingJob,
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
  .eq("metadata->>foundation_model", FOUNDATION_MODEL)
  .order("updated_at", { ascending: false })
  .limit(10);
if (jobResult.error) throw jobResult.error;

const rows = Array.isArray(jobResult.data) ? jobResult.data : [];
const eligible = rows.filter((row) => {
  const metadata = object(row.metadata);
  const status = text(metadata.status, 80);
  const providerJobId = text(metadata.provider_job_id, 240);
  return providerJobId && (ACTIVE_STATUSES.has(status) || TERMINAL_STATUSES.has(status));
});
const active = eligible.filter((row) =>
  ACTIVE_STATUSES.has(text(object(row.metadata).status, 80)),
);
if (active.length > 1) {
  throw new Error(
    `AVANTIQO_MODEL_TRAINING_WATCH_ACTIVE_JOB_AMBIGUOUS:${active.length}`,
  );
}
const job = active[0] || eligible[0] || null;
if (!job) {
  throw new Error("AVANTIQO_MODEL_TRAINING_WATCH_SUBMITTED_JOB_NOT_FOUND");
}

const initialMetadata = object(job.metadata);
console.log(JSON.stringify({
  contract: CONTRACT,
  event: "AVANTIQO_MODEL_TRAINING_WATCH_STARTED",
  main_commit: mainCommit,
  learning_organization_resolved: Boolean(organization.organization_id),
  learning_organization_source: organization.source,
  training_job_subject: text(job.subject, 240),
  training_job_status: text(initialMetadata.status, 80),
  provider_job_id: text(initialMetadata.provider_job_id, 240),
  management_api_key_source: managementApiKeySource,
  poll_interval_ms: pollIntervalMs,
  max_polls: maxPolls,
  provider_job_submitted: false,
  production_deploy_performed: false,
  production_model_promoted: false,
  secrets_printed: false,
}, null, 2));

function printTerminal(result) {
  const metadata = object(result?.job?.metadata);
  const governance = object(result?.governance);
  const metrics = object(metadata.training_metrics);
  console.log(JSON.stringify({
    contract: CONTRACT,
    event: result.status === "TRAINING_COMPLETED"
      ? "AVANTIQO_MODEL_TRAINING_COMPLETED"
      : "AVANTIQO_MODEL_TRAINING_FAILED",
    success: result.status === "TRAINING_COMPLETED",
    status: result.status,
    training_job_subject: text(result?.job?.subject || job.subject, 240),
    provider_job_id: text(metadata.provider_job_id, 240) || null,
    adapter_artifact_reference: text(
      result?.adapter_artifact_reference || metadata.adapter_artifact_reference,
      1000,
    ) || null,
    failure: text(result?.failure || metadata.failure, 1200) || null,
    train_example_count: Number(metrics.train_example_count || 0),
    holdout_example_count: Number(metrics.holdout_example_count || 0),
    optimizer_steps: Number(metrics.optimizer_steps || 0),
    mean_training_loss: Number(metrics.mean_training_loss || 0),
    holdout_loss: Number(metrics.holdout_loss || 0),
    holdout_perplexity: Number(metrics.holdout_perplexity || 0),
    method: text(metrics.method, 120) || null,
    base_precision: text(metrics.base_precision, 40) || null,
    base_quantized: metrics.base_quantized ?? null,
    gpu_device_name: text(metrics.gpu_device_name, 240) || null,
    gpu_total_memory_bytes: Number(metrics.gpu_total_memory_bytes || 0),
    max_sequence_length: Number(metrics.max_sequence_length || 0),
    moe_adapter_attachment_verified:
      governance.moe_adapter_attachment_verified === true ||
      metrics.moe_adapter_attachment_verified === true,
    bf16_gpu_preflight_verified:
      governance.bf16_gpu_preflight_verified === true ||
      metrics.bf16_gpu_preflight_verified === true,
    foundation_weights_mutated:
      governance.foundation_weights_mutated === true,
    production_model_promoted:
      governance.production_model_promoted === true,
    candidate_benchmark_required:
      governance.candidate_benchmark_required === true ||
      metadata.requires_candidate_benchmark === true,
    production_model_promotion_effect:
      governance.production_model_promotion_effect ||
      metadata.production_model_promotion_effect ||
      "NONE",
    provider_job_submitted: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
}

if (TERMINAL_STATUSES.has(text(initialMetadata.status, 80))) {
  const terminal = {
    status: text(initialMetadata.status, 80),
    job,
    adapter_artifact_reference: initialMetadata.adapter_artifact_reference,
    failure: initialMetadata.failure,
    governance: {
      foundation_weights_mutated: false,
      production_model_promoted: false,
      candidate_benchmark_required:
        initialMetadata.requires_candidate_benchmark === true,
      moe_adapter_attachment_verified:
        object(initialMetadata.training_metrics).moe_adapter_attachment_verified === true,
      bf16_gpu_preflight_verified:
        object(initialMetadata.training_metrics).bf16_gpu_preflight_verified === true,
      production_model_promotion_effect:
        initialMetadata.production_model_promotion_effect || "NONE",
    },
  };
  printTerminal(terminal);
  if (terminal.status === "TRAINING_FAILED") process.exitCode = 1;
} else {
  let lastStatus = text(initialMetadata.status, 80);
  let completed = false;

  for (let poll = 1; poll <= maxPolls; poll += 1) {
    const result = await refreshAvantiqoModelTrainingJob({
      trainingJobId: job.id,
    });
    const status = text(result?.status, 80);

    if (status !== lastStatus || poll === 1 || poll % 6 === 0) {
      console.log(JSON.stringify({
        contract: CONTRACT,
        event: "AVANTIQO_MODEL_TRAINING_WATCH_PROGRESS",
        success: true,
        poll,
        status,
        provider_job_id: text(
          result?.job?.metadata?.provider_job_id || initialMetadata.provider_job_id,
          240,
        ),
        provider_job_submitted: false,
        production_deploy_performed: false,
        production_model_promoted: false,
        secrets_printed: false,
      }, null, 2));
    }
    lastStatus = status;

    if (TERMINAL_STATUSES.has(status)) {
      printTerminal(result);
      completed = true;
      if (status === "TRAINING_FAILED") process.exitCode = 1;
      break;
    }

    if (!ACTIVE_STATUSES.has(status)) {
      throw new Error(
        `AVANTIQO_MODEL_TRAINING_WATCH_UNEXPECTED_STATUS:${status || "UNKNOWN"}`,
      );
    }

    if (poll < maxPolls) await sleep(pollIntervalMs);
  }

  if (!completed && !process.exitCode) {
    console.log(JSON.stringify({
      contract: CONTRACT,
      event: "AVANTIQO_MODEL_TRAINING_WATCH_LIMIT_REACHED",
      success: false,
      status: lastStatus,
      provider_job_submitted: false,
      production_deploy_performed: false,
      production_model_promoted: false,
      secrets_printed: false,
    }, null, 2));
    process.exitCode = 2;
  }
}

if (!process.exitCode) {
  console.log("AVANTIQO_MODEL_TRAINING_WATCH=TERMINAL_STATE_RECORDED");
  console.log("AVANTIQO_MODEL_TRAINING_WATCH_PRODUCTION_PROMOTION=NO");
  console.log("AVANTIQO_MODEL_TRAINING_WATCH_SECRETS_PRINTED=NO");
}
