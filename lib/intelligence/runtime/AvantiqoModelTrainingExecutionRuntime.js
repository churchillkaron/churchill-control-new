import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_MODEL_TRAINING_EXECUTION_CONTRACT =
  "AVANTIQO_MODEL_TRAINING_EXECUTION_V1";

const MEMORY_TABLE = "intelligence_memories";
const TRAINING_JOB_SCOPE = "platform_model_training_jobs";
const EXAMPLE_SCOPE = "platform_training_examples";
const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const DEFAULT_TIMEOUT_MS = 30000;
const FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";

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

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value, 20).toLowerCase());
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function trainerConfig() {
  if (!enabled(process.env.AVANTIQO_INTELLIGENCE_TRAINER_ENABLED)) {
    throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_DISABLED");
  }
  const endpointId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID, 160);
  const apiKey = text(process.env.RUNPOD_API_KEY, 1000);
  if (!endpointId) throw new Error("RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID_REQUIRED");
  if (!/^[A-Za-z0-9_-]+$/.test(endpointId)) {
    throw new Error("RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID_INVALID");
  }
  if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
  return {
    endpointId,
    apiKey,
    baseUrl: `${RUNPOD_API_BASE}/${endpointId}`,
    timeoutMs: Math.max(
      1000,
      Number(process.env.AVANTIQO_INTELLIGENCE_TRAINER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
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
    const message = text(body?.error?.message || body?.error || body?.message, 800);
    throw new Error(
      `AVANTIQO_INTELLIGENCE_TRAINER_RUNPOD_REQUEST_FAILED:${response.status}:${message || "UNKNOWN"}`,
    );
  }
  return body;
}

function runpodStatus(value) {
  const status = text(value, 80).toUpperCase();
  if (["COMPLETED", "COMPLETE", "SUCCEEDED", "SUCCESS", "DONE"].includes(status)) {
    return "completed";
  }
  if (["FAILED", "ERROR", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(status)) {
    return "failed";
  }
  if (["IN_QUEUE", "QUEUED", "PENDING"].includes(status)) return "queued";
  return "processing";
}

async function loadTrainingJob(organizationId, trainingJobId) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,subject,content,metadata,active,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", TRAINING_JOB_SCOPE)
    .eq("id", trainingJobId)
    .eq("active", true)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

function parseExample(row = {}) {
  const metadata = object(row.metadata);
  if (
    metadata.contract !== "AVANTIQO_TRAINING_EXAMPLE_COMPILER_V1" ||
    metadata.training_example_validated !== true ||
    metadata.synthetic !== true ||
    metadata.customer_private_content_included !== false ||
    metadata.raw_customer_turn_included !== false ||
    metadata.raw_payload_included !== false ||
    metadata.raw_output_included !== false ||
    metadata.raw_reasoning_included !== false ||
    metadata.identifiers_included !== false
  ) {
    return null;
  }
  let content;
  try {
    content = JSON.parse(text(row.content, 12000));
  } catch {
    return null;
  }
  const userTask = text(content?.user_task, 3000);
  const assistantTarget = text(content?.assistant_target, 5000);
  const capabilityKey = text(metadata.capability_key || row.subject, 300);
  if (!userTask || !assistantTarget || !capabilityKey) return null;
  return {
    user_task: userTask,
    assistant_target: assistantTarget,
    capability_key: capabilityKey,
  };
}

async function loadBoundExamples(organizationId, job) {
  const metadata = object(job.metadata);
  const trainIds = list(metadata.train_example_ids).map((item) => text(item, 160)).filter(Boolean);
  const holdoutIds = list(metadata.holdout_example_ids).map((item) => text(item, 160)).filter(Boolean);
  const allIds = [...new Set([...trainIds, ...holdoutIds])];
  if (!trainIds.length || !holdoutIds.length || !allIds.length) {
    throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_BOUND_EXAMPLES_REQUIRED");
  }

  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,subject,content,metadata,active")
    .eq("organization_id", organizationId)
    .eq("memory_scope", EXAMPLE_SCOPE)
    .eq("active", true)
    .in("id", allIds);
  if (result.error) throw result.error;
  const byId = new Map(list(result.data).map((row) => [row.id, row]));
  const train = trainIds.map((id) => parseExample(byId.get(id))).filter(Boolean);
  const holdout = holdoutIds.map((id) => parseExample(byId.get(id))).filter(Boolean);
  if (train.length !== trainIds.length || holdout.length !== holdoutIds.length) {
    throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_EXAMPLE_VALIDATION_FAILED");
  }
  return { train, holdout };
}

async function updateJob(organizationId, job, patch = {}) {
  const now = new Date().toISOString();
  const metadata = {
    ...object(job.metadata),
    ...object(patch),
    updated_at: now,
  };
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({ metadata, updated_at: now })
    .eq("organization_id", organizationId)
    .eq("memory_scope", TRAINING_JOB_SCOPE)
    .eq("id", job.id)
    .select("id,subject,content,metadata,updated_at")
    .single();
  if (result.error) throw result.error;
  return result.data;
}

function trainingSettings(value = {}) {
  const source = object(value);
  return {
    max_sequence_length: Math.max(256, Math.min(4096, Number(source.max_sequence_length) || 2048)),
    epochs: Math.max(1, Math.min(3, Number(source.epochs) || 1)),
    max_steps: Math.max(1, Math.min(300, Number(source.max_steps) || 120)),
    learning_rate: Math.max(0.000001, Math.min(0.001, Number(source.learning_rate) || 0.0002)),
    gradient_accumulation_steps: Math.max(
      1,
      Math.min(64, Number(source.gradient_accumulation_steps) || 8),
    ),
    lora_rank: Math.max(4, Math.min(64, Number(source.lora_rank) || 16)),
    lora_alpha: Math.max(8, Math.min(256, Number(source.lora_alpha) || 32)),
    lora_dropout: Math.max(0, Math.min(0.3, Number(source.lora_dropout) || 0.05)),
  };
}

export async function submitAvantiqoModelTrainingJob({
  trainingJobId,
  approved = false,
  settings = {},
} = {}) {
  const organizationId = learningOrganizationId();
  const id = text(trainingJobId, 160);
  if (!organizationId) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_LEARNING_ORGANIZATION_REQUIRED");
  if (!id) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_JOB_ID_REQUIRED");
  if (approved !== true) {
    throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_EXPLICIT_APPROVAL_REQUIRED");
  }

  const job = await loadTrainingJob(organizationId, id);
  if (!job) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_JOB_NOT_FOUND");
  const jobMetadata = object(job.metadata);
  if (jobMetadata.status !== "PREPARED") {
    throw new Error(`AVANTIQO_INTELLIGENCE_TRAINER_JOB_NOT_PREPARED:${text(jobMetadata.status, 80)}`);
  }
  if (text(jobMetadata.foundation_model, 300) !== FOUNDATION_MODEL) {
    throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_FOUNDATION_MODEL_MISMATCH");
  }

  const examples = await loadBoundExamples(organizationId, job);
  const config = trainerConfig();
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
          contract: "AVANTIQO_INTELLIGENCE_TRAINER_V1",
          action: "train",
          execute_training: true,
          job_id: text(jobMetadata.job_id || job.subject, 160),
          foundation_model: FOUNDATION_MODEL,
          train_examples: examples.train,
          holdout_examples: examples.holdout,
          settings: trainingSettings(settings),
        },
      }),
    },
    config.timeoutMs,
  );
  const body = await responseJson(response);
  const providerJobId = text(body.id || body.job_id || body.jobId, 240);
  if (!providerJobId) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_PROVIDER_JOB_ID_REQUIRED");

  const updated = await updateJob(organizationId, job, {
    status: "TRAINING_SUBMITTED",
    training_execution_authorized: true,
    automatic_training_started: false,
    provider: "RUNPOD_SERVERLESS",
    provider_job_id: providerJobId,
    submitted_at: new Date().toISOString(),
    production_model_promotion_effect: "NONE",
  });
  return {
    contract: AVANTIQO_MODEL_TRAINING_EXECUTION_CONTRACT,
    status: "TRAINING_SUBMITTED",
    provider_job_id: providerJobId,
    job: updated,
    governance: {
      explicit_execution_approval_observed: true,
      dedicated_trainer_endpoint: true,
      production_inference_endpoint_mutated: false,
      automatic_production_promotion: false,
      production_model_promotion_effect: "NONE",
    },
  };
}

export async function refreshAvantiqoModelTrainingJob({ trainingJobId } = {}) {
  const organizationId = learningOrganizationId();
  const id = text(trainingJobId, 160);
  if (!organizationId) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_LEARNING_ORGANIZATION_REQUIRED");
  if (!id) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_JOB_ID_REQUIRED");
  const job = await loadTrainingJob(organizationId, id);
  if (!job) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_JOB_NOT_FOUND");
  const metadata = object(job.metadata);
  const providerJobId = text(metadata.provider_job_id, 240);
  if (!providerJobId) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_PROVIDER_JOB_ID_REQUIRED");

  const config = trainerConfig();
  const response = await fetchWithTimeout(
    `${config.baseUrl}/status/${encodeURIComponent(providerJobId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: "application/json",
      },
    },
    config.timeoutMs,
  );
  const body = await responseJson(response);
  const status = runpodStatus(body.status);
  if (["queued", "processing"].includes(status)) {
    const updated = await updateJob(organizationId, job, {
      status: status === "queued" ? "TRAINING_QUEUED" : "TRAINING_RUNNING",
      last_status_at: new Date().toISOString(),
    });
    return {
      contract: AVANTIQO_MODEL_TRAINING_EXECUTION_CONTRACT,
      status: updated.metadata.status,
      job: updated,
    };
  }

  if (status === "failed") {
    const failure = text(body?.error || body?.output?.error || "Trainer execution failed", 1200);
    const updated = await updateJob(organizationId, job, {
      status: "TRAINING_FAILED",
      failure,
      completed_at: new Date().toISOString(),
      production_model_promotion_effect: "NONE",
    });
    return {
      contract: AVANTIQO_MODEL_TRAINING_EXECUTION_CONTRACT,
      status: "TRAINING_FAILED",
      failure,
      job: updated,
    };
  }

  const output = object(body.output);
  const artifactReference = text(output.adapter_artifact_reference, 1000);
  if (!artifactReference.startsWith("/runpod-volume/avantiqo-intelligence-training/")) {
    throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_ARTIFACT_REFERENCE_INVALID");
  }
  if (output.foundation_weights_mutated !== false || output.production_model_promoted !== false) {
    throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_GOVERNANCE_INVARIANT_FAILED");
  }

  const updated = await updateJob(organizationId, job, {
    status: "TRAINING_COMPLETED",
    adapter_artifact_reference: artifactReference,
    training_metrics: {
      train_example_count: Number(output.train_example_count || 0),
      holdout_example_count: Number(output.holdout_example_count || 0),
      optimizer_steps: Number(output.optimizer_steps || 0),
      mean_training_loss: Number(output.mean_training_loss || 0),
      holdout_loss: Number(output.holdout_loss || 0),
      holdout_perplexity: Number(output.holdout_perplexity || 0),
      method: text(output.method, 120),
    },
    completed_at: new Date().toISOString(),
    requires_candidate_benchmark: true,
    production_model_promotion_effect: "NONE",
  });
  return {
    contract: AVANTIQO_MODEL_TRAINING_EXECUTION_CONTRACT,
    status: "TRAINING_COMPLETED",
    adapter_artifact_reference: artifactReference,
    job: updated,
    governance: {
      foundation_weights_mutated: false,
      production_model_promoted: false,
      candidate_benchmark_required: true,
      production_model_promotion_effect: "NONE",
    },
  };
}

export const AvantiqoModelTrainingExecutionRuntime = Object.freeze({
  contract: AVANTIQO_MODEL_TRAINING_EXECUTION_CONTRACT,
  submit: submitAvantiqoModelTrainingJob,
  refresh: refreshAvantiqoModelTrainingJob,
});
