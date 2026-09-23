import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { certifyAvantiqoModelTrainingReadiness } from "@/lib/intelligence/runtime/AvantiqoModelTrainingReadinessRuntime";
import { assertAvantiqoSharedTrainerReservation } from "@/lib/intelligence/runtime/AvantiqoSharedTrainerReservationGuard";

export const AVANTIQO_MODEL_TRAINING_EXECUTION_CONTRACT = "AVANTIQO_MODEL_TRAINING_EXECUTION_V3";
const MEMORY_TABLE = "intelligence_memories";
const TRAINING_JOB_SCOPE = "platform_model_training_jobs";
const FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const INFRASTRUCTURE_PROVIDER = "AVANTIQO_LOCAL_TRAINER_V1";

function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function learningOrganizationId() { return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160); }

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

async function updateJob(organizationId, job, patch = {}) {
  const now = new Date().toISOString();
  const metadata = { ...object(job.metadata), ...object(patch), updated_at: now };
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

function localTrainerUnavailable() {
  const error = new Error("AVANTIQO_INTELLIGENCE_LOCAL_TRAINER_EXECUTOR_REQUIRED");
  error.code = "AVANTIQO_INTELLIGENCE_LOCAL_TRAINER_EXECUTOR_REQUIRED";
  error.status = 503;
  return error;
}

export async function submitAvantiqoModelTrainingJob({ trainingJobId, approved = false } = {}) {
  const organizationId = learningOrganizationId();
  const id = text(trainingJobId, 160);
  if (!organizationId) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_LEARNING_ORGANIZATION_REQUIRED");
  if (!id) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_JOB_ID_REQUIRED");
  if (approved !== true) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_EXPLICIT_APPROVAL_REQUIRED");

  const job = await loadTrainingJob(organizationId, id);
  if (!job) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_JOB_NOT_FOUND");
  const metadata = object(job.metadata);
  if (metadata.status !== "PREPARED") {
    throw new Error(`AVANTIQO_INTELLIGENCE_TRAINER_JOB_NOT_PREPARED:${text(metadata.status, 80)}`);
  }
  if (text(metadata.foundation_model, 300) !== FOUNDATION_MODEL) {
    throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_FOUNDATION_MODEL_MISMATCH");
  }

  const readiness = await certifyAvantiqoModelTrainingReadiness({ trainingJobId: job.id });
  if (readiness.status !== "READY_FOR_RESOURCE_PREFLIGHT") {
    throw new Error(`AVANTIQO_INTELLIGENCE_TRAINER_READINESS_FAILED:${text(readiness.status, 120)}`);
  }
  await assertAvantiqoSharedTrainerReservation();

  await updateJob(organizationId, job, {
    status: "LOCAL_TRAINER_REQUIRED",
    training_execution_authorized: true,
    automatic_training_started: false,
    provider: "AVANTIQO",
    infrastructure_provider: INFRASTRUCTURE_PROVIDER,
    external_compute_allowed: false,
    external_provider_job_submitted: false,
    local_owned_hardware_required: true,
    readiness_certification: readiness,
    production_model_promotion_effect: "NONE",
  });

  throw localTrainerUnavailable();
}

export async function refreshAvantiqoModelTrainingJob({ trainingJobId } = {}) {
  const organizationId = learningOrganizationId();
  const id = text(trainingJobId, 160);
  if (!organizationId) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_LEARNING_ORGANIZATION_REQUIRED");
  if (!id) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_JOB_ID_REQUIRED");
  const job = await loadTrainingJob(organizationId, id);
  if (!job) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_JOB_NOT_FOUND");
  throw localTrainerUnavailable();
}

export const AvantiqoModelTrainingExecutionRuntime = Object.freeze({
  contract: AVANTIQO_MODEL_TRAINING_EXECUTION_CONTRACT,
  infrastructure_policy: "AVANTIQO_LOCAL_ONLY",
  external_compute_allowed: false,
  submit: submitAvantiqoModelTrainingJob,
  refresh: refreshAvantiqoModelTrainingJob,
});
