import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { certifyAvantiqoModelTrainingReadiness } from "@/lib/intelligence/runtime/AvantiqoModelTrainingReadinessRuntime";

export const AVANTIQO_MODEL_TRAINING_EXECUTION_CONTRACT = "AVANTIQO_MODEL_TRAINING_EXECUTION_V2";
const MEMORY_TABLE = "intelligence_memories";
const TRAINING_JOB_SCOPE = "platform_model_training_jobs";
const EXAMPLE_SCOPE = "platform_training_examples";
const FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const TRAINING_METHOD = "LORA_BF16_PEFT_QWEN3_MOE";
const APP_NAME = "avantiqo-intelligence-trainer-owned";
const FUNCTION_NAME = "train";
const JOB_PREFIX = "modal-intelligence-trainer:";
const INFRASTRUCTURE_PROVIDER = "MODAL_H100_OWNED_TRAINER_V1";
const VOLUME_NAME = "avantiqo-intelligence-training-v1";
const DEFAULT_SEQUENCE_LENGTH = 1024;
const MAX_SEQUENCE_LENGTH = 2048;
const DENSE_LORA_TARGET_MODULES = ["q_proj", "v_proj"];
let sdkPromise = null;

function text(value, limit = 4000) { return String(value ?? "").trim().slice(0, limit); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value, 20).toLowerCase()); }
function learningOrganizationId() { return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160); }
async function modalSdk() { if (!sdkPromise) sdkPromise = import("modal"); return sdkPromise; }
function trainerConfig() {
  if (!enabled(process.env.AVANTIQO_INTELLIGENCE_TRAINER_ENABLED)) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_DISABLED");
  const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID, 500);
  const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET, 1000);
  if (!tokenId || !tokenSecret) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_MODAL_CREDENTIALS_REQUIRED");
  return { tokenId, tokenSecret, environment: text(process.env.AVANTIQO_MODAL_ENVIRONMENT || process.env.MODAL_ENVIRONMENT, 120) };
}
async function clientFor(cfg) { const sdk = await modalSdk(); return { sdk, client: new sdk.ModalClient({ tokenId: cfg.tokenId, tokenSecret: cfg.tokenSecret }) }; }
async function loadTrainingJob(organizationId, trainingJobId) {
  const result = await supabaseAdmin.from(MEMORY_TABLE).select("id,memory_key,subject,content,metadata,active,updated_at").eq("organization_id", organizationId).eq("memory_scope", TRAINING_JOB_SCOPE).eq("id", trainingJobId).eq("active", true).maybeSingle();
  if (result.error) throw result.error; return result.data || null;
}
function parseExample(row = {}) {
  const metadata = object(row.metadata);
  if (metadata.contract !== "AVANTIQO_TRAINING_EXAMPLE_COMPILER_V1" || metadata.training_example_validated !== true || metadata.synthetic !== true || metadata.customer_private_content_included !== false || metadata.raw_customer_turn_included !== false || metadata.raw_payload_included !== false || metadata.raw_output_included !== false || metadata.raw_reasoning_included !== false || metadata.identifiers_included !== false) return null;
  let content; try { content = JSON.parse(text(row.content, 12000)); } catch { return null; }
  const userTask = text(content?.user_task, 3000); const assistantTarget = text(content?.assistant_target, 5000); const capabilityKey = text(metadata.capability_key || row.subject, 300);
  return userTask && assistantTarget && capabilityKey ? { user_task: userTask, assistant_target: assistantTarget, capability_key: capabilityKey } : null;
}
async function loadBoundExamples(organizationId, job) {
  const metadata = object(job.metadata); const trainIds = list(metadata.train_example_ids).map((item) => text(item, 160)).filter(Boolean); const holdoutIds = list(metadata.holdout_example_ids).map((item) => text(item, 160)).filter(Boolean); const allIds = [...new Set([...trainIds, ...holdoutIds])];
  if (!trainIds.length || !holdoutIds.length) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_BOUND_EXAMPLES_REQUIRED");
  const result = await supabaseAdmin.from(MEMORY_TABLE).select("id,subject,content,metadata,active").eq("organization_id", organizationId).eq("memory_scope", EXAMPLE_SCOPE).eq("active", true).in("id", allIds);
  if (result.error) throw result.error; const byId = new Map(list(result.data).map((row) => [row.id, row]));
  const train = trainIds.map((id) => parseExample(byId.get(id))).filter(Boolean); const holdout = holdoutIds.map((id) => parseExample(byId.get(id))).filter(Boolean);
  if (train.length !== trainIds.length || holdout.length !== holdoutIds.length) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_EXAMPLE_VALIDATION_FAILED");
  return { train, holdout };
}
async function updateJob(organizationId, job, patch = {}) {
  const now = new Date().toISOString(); const metadata = { ...object(job.metadata), ...object(patch), updated_at: now };
  const result = await supabaseAdmin.from(MEMORY_TABLE).update({ metadata, updated_at: now }).eq("organization_id", organizationId).eq("memory_scope", TRAINING_JOB_SCOPE).eq("id", job.id).select("id,subject,content,metadata,updated_at").single();
  if (result.error) throw result.error; return result.data;
}
function trainingSettings(value = {}) {
  const source = object(value); return { max_sequence_length: Math.max(256, Math.min(MAX_SEQUENCE_LENGTH, Number(source.max_sequence_length) || DEFAULT_SEQUENCE_LENGTH)), epochs: Math.max(1, Math.min(3, Number(source.epochs) || 1)), max_steps: Math.max(1, Math.min(300, Number(source.max_steps) || 120)), learning_rate: Math.max(0.000001, Math.min(0.001, Number(source.learning_rate) || 0.0002)), gradient_accumulation_steps: Math.max(1, Math.min(64, Number(source.gradient_accumulation_steps) || 8)), lora_rank: Math.max(4, Math.min(64, Number(source.lora_rank) || 16)), lora_alpha: Math.max(8, Math.min(256, Number(source.lora_alpha) || 32)), lora_dropout: 0 };
}
function isPending(error, sdk) { return error instanceof sdk.FunctionTimeoutError || /Timeout exceeded/i.test(text(error?.message, 500)); }
function validateCompletedOutput(output = {}) {
  const artifactReference = text(output.adapter_artifact_reference, 1000);
  if (!artifactReference.startsWith(`modal-volume://${VOLUME_NAME}/artifacts/`)) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_ARTIFACT_REFERENCE_INVALID");
  if (text(output.infrastructure_provider, 120) !== INFRASTRUCTURE_PROVIDER || text(output.modal_gpu, 40) !== "H100") throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_MODAL_RUNTIME_INVALID");
  if (output.foundation_weights_mutated !== false || output.production_model_promoted !== false || output.raw_reasoning_persisted !== false) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_GOVERNANCE_INVARIANT_FAILED");
  const targets = list(output.dense_lora_target_modules).map((item) => text(item, 80));
  if (output.moe_adapter_attachment_verified !== true || output.moe_fused_expert_layout_verified !== true || output.bf16_gpu_preflight_verified !== true || output.base_precision !== "BF16" || output.base_quantized !== false || Number(output.gpu_total_memory_bytes || 0) < 78 * 1024 * 1024 * 1024 || Number(output.max_sequence_length || 0) < 256 || Number(output.max_sequence_length || 0) > MAX_SEQUENCE_LENGTH || targets.length !== DENSE_LORA_TARGET_MODULES.length || targets.some((item, index) => item !== DENSE_LORA_TARGET_MODULES[index]) || Number(output.total_trainable_parameter_count || 0) <= 0 || Number(output.lora_dropout ?? 1) !== 0 || text(output.method, 120) !== TRAINING_METHOD) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_MOE_ADAPTER_INVARIANT_FAILED");
  return { artifactReference, targets };
}

export async function submitAvantiqoModelTrainingJob({ trainingJobId, approved = false, settings = {} } = {}) {
  const organizationId = learningOrganizationId(); const id = text(trainingJobId, 160);
  if (!organizationId) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_LEARNING_ORGANIZATION_REQUIRED"); if (!id) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_JOB_ID_REQUIRED"); if (approved !== true) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_EXPLICIT_APPROVAL_REQUIRED");
  const job = await loadTrainingJob(organizationId, id); if (!job) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_JOB_NOT_FOUND"); const jobMetadata = object(job.metadata);
  if (jobMetadata.status !== "PREPARED") throw new Error(`AVANTIQO_INTELLIGENCE_TRAINER_JOB_NOT_PREPARED:${text(jobMetadata.status, 80)}`); if (text(jobMetadata.foundation_model, 300) !== FOUNDATION_MODEL) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_FOUNDATION_MODEL_MISMATCH");
  const readiness = await certifyAvantiqoModelTrainingReadiness({ trainingJobId: job.id }); if (readiness.status !== "READY_FOR_RESOURCE_PREFLIGHT") throw new Error(`AVANTIQO_INTELLIGENCE_TRAINER_READINESS_FAILED:${text(readiness.status, 120)}`);
  const examples = await loadBoundExamples(organizationId, job); const resolvedSettings = trainingSettings(settings); const cfg = trainerConfig(); const { client } = await clientFor(cfg); const lookup = cfg.environment ? { environment: cfg.environment } : {}; const worker = await client.functions.fromName(APP_NAME, FUNCTION_NAME, lookup);
  const payload = { contract: "AVANTIQO_INTELLIGENCE_TRAINER_V1", action: "train", execute_training: true, job_id: text(jobMetadata.job_id || job.subject, 160), foundation_model: FOUNDATION_MODEL, train_examples: examples.train, holdout_examples: examples.holdout, settings: resolvedSettings };
  const call = await worker.spawn([payload]); const callId = text(call.functionCallId, 240); if (!callId) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_MODAL_CALL_ID_REQUIRED"); const providerJobId = `${JOB_PREFIX}${callId}`;
  const updated = await updateJob(organizationId, job, { status: "TRAINING_SUBMITTED", training_execution_authorized: true, automatic_training_started: false, provider: "MODAL", infrastructure_provider: INFRASTRUCTURE_PROVIDER, provider_job_id: providerJobId, training_method: TRAINING_METHOD, training_settings: resolvedSettings, dense_lora_target_modules: DENSE_LORA_TARGET_MODULES, readiness_certification: readiness, modal_app: APP_NAME, modal_function: FUNCTION_NAME, modal_volume: VOLUME_NAME, submitted_at: new Date().toISOString(), production_model_promotion_effect: "NONE" });
  return { contract: AVANTIQO_MODEL_TRAINING_EXECUTION_CONTRACT, status: "TRAINING_SUBMITTED", provider_job_id: providerJobId, job: updated, governance: { explicit_execution_approval_observed: true, live_training_readiness_verified: true, direct_modal_sdk_transport: true, public_training_endpoint_used: false, runpod_used: false, foundation_weights_immutable: true, automatic_production_promotion: false, production_model_promotion_effect: "NONE" } };
}

export async function refreshAvantiqoModelTrainingJob({ trainingJobId } = {}) {
  const organizationId = learningOrganizationId(); const id = text(trainingJobId, 160); if (!organizationId) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_LEARNING_ORGANIZATION_REQUIRED"); if (!id) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_JOB_ID_REQUIRED"); const job = await loadTrainingJob(organizationId, id); if (!job) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_JOB_NOT_FOUND");
  const providerJobId = text(job.metadata?.provider_job_id, 300); if (!providerJobId.startsWith(JOB_PREFIX)) throw new Error("AVANTIQO_INTELLIGENCE_TRAINER_MODAL_JOB_ID_REQUIRED"); const callId = providerJobId.slice(JOB_PREFIX.length); const cfg = trainerConfig(); const { sdk, client } = await clientFor(cfg);
  let output; try { const call = await client.functionCalls.fromId(callId); output = await call.get({ timeoutMs: 0 }); } catch (error) { if (isPending(error, sdk)) { const updated = await updateJob(organizationId, job, { status: "TRAINING_RUNNING", last_status_at: new Date().toISOString() }); return { contract: AVANTIQO_MODEL_TRAINING_EXECUTION_CONTRACT, status: "TRAINING_RUNNING", job: updated }; } const failure = text(error?.message || error, 1200); const updated = await updateJob(organizationId, job, { status: "TRAINING_FAILED", failure, completed_at: new Date().toISOString(), production_model_promotion_effect: "NONE" }); return { contract: AVANTIQO_MODEL_TRAINING_EXECUTION_CONTRACT, status: "TRAINING_FAILED", failure, job: updated }; }
  const verified = validateCompletedOutput(object(output)); const updated = await updateJob(organizationId, job, { status: "TRAINING_COMPLETED", adapter_artifact_reference: verified.artifactReference, training_metrics: { train_example_count: Number(output.train_example_count || 0), holdout_example_count: Number(output.holdout_example_count || 0), optimizer_steps: Number(output.optimizer_steps || 0), mean_training_loss: Number(output.mean_training_loss || 0), holdout_loss: Number(output.holdout_loss || 0), holdout_perplexity: Number(output.holdout_perplexity || 0), method: text(output.method, 120), base_precision: "BF16", base_quantized: false, bf16_gpu_preflight_verified: true, gpu_device_name: text(output.gpu_device_name, 240), gpu_total_memory_bytes: Number(output.gpu_total_memory_bytes || 0), max_sequence_length: Number(output.max_sequence_length || 0), dense_lora_target_modules: verified.targets, total_trainable_parameter_count: Number(output.total_trainable_parameter_count || 0), lora_dropout: 0 }, completed_at: new Date().toISOString(), requires_candidate_benchmark: true, production_model_promotion_effect: "NONE" });
  return { contract: AVANTIQO_MODEL_TRAINING_EXECUTION_CONTRACT, status: "TRAINING_COMPLETED", adapter_artifact_reference: verified.artifactReference, job: updated, governance: { direct_modal_sdk_transport: true, runpod_used: false, foundation_weights_mutated: false, production_model_promoted: false, candidate_benchmark_required: true, production_model_promotion_effect: "NONE" } };
}

export const AvantiqoModelTrainingExecutionRuntime = Object.freeze({ contract: AVANTIQO_MODEL_TRAINING_EXECUTION_CONTRACT, submit: submitAvantiqoModelTrainingJob, refresh: refreshAvantiqoModelTrainingJob });
