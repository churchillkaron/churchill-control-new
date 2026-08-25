import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const ENGINE_CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1";
const BENCHMARK_CONTRACT = "AVANTIQO_IMAGE_Z_IMAGE_V7_DEFAULT_QUALITY_CERTIFICATE_V1";
const EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const EVIDENCE_CONTRACT = "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V4";
const EVIDENCE_REVISION = "AVANTIQO_IMAGE_WORKER_IMAGE_V7_REALISM_COMPILER_V1";
const ENDPOINT_NAME = "avantiqo-image-v1";
const FOUNDATION_MODEL = "Tongyi-MAI/Z-Image";
const EXPECTED_RUNTIME = "AVANTIQO_IMAGE_MULTI_FOUNDATION_PHYSICAL_VOLUME_USAGE_QUALITY_V2";
const EXPECTED_PROFILE = "AVANTIQO_IMAGE_COMMERCIAL_PHOTOREAL_CANDIDATE_V2";
const EXPECTED_POLICY = "Z_IMAGE_RESTRAINED_PHOTOGRAPHIC_V2";
const EXPECTED_COMPILER = "AVANTIQO_IMAGE_Z_IMAGE_QUALITY_COMPILER_V1";
const EXPECTED_ENTRYPOINT = "handler_v7.py";
const EXPECTED_ENTRYPOINT_REVISION = "AVANTIQO_IMAGE_HANDLER_V7_Z_IMAGE_REALISM_COMPILER_V1";
const EXPECTED_WIDTH = 1024;
const EXPECTED_HEIGHT = 1024;
const EXPECTED_DEFAULT_STEPS = 28;
const EXPECTED_DEFAULT_CFG = 4;
const SEED = 51000;
const BUCKET = "creative-assets";
const POLL_MS = 5000;
const MAX_WAIT_MS = Math.max(
  60_000,
  Math.min(20 * 60 * 1000, Number(process.env.AVANTIQO_IMAGE_Z_V7_DEFAULT_TIMEOUT_MS || 12 * 60 * 1000)),
);
const DEFAULT_REPORT = "/tmp/avantiqo-z-image-v7-default-quality.json";
const DEFAULT_IMAGE = "/tmp/avantiqo-z-image-v7-default-quality.png";
const DEFAULT_INSTRUCTION = "Photorealistic premium restaurant advertising photograph of a freshly cooked ribeye steak on elegant dark stoneware, realistic natural searing and moisture, golden roasted potato wedges, herb butter melting naturally, restrained fresh vegetables, dark walnut and black stone restaurant table, warm professional food photography lighting, natural diner-level three-quarter camera angle, shallow depth of field, expensive luxury restaurant atmosphere, physically plausible food and reflections, no people, no hands, no text, no logo, no CGI appearance, no plastic texture.";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
}
function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function terminalFailure(status) {
  return ["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(text(status).toUpperCase());
}
function normalizeListResponse(value, candidateKeys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...candidateKeys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalizeListResponse(value[key], candidateKeys, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}
function healthSummary(value = {}) {
  const jobs = object(value.jobs);
  const workers = object(value.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: {
      running: finite(workers.running, 0),
      unhealthy: finite(workers.unhealthy, 0),
    },
  };
}
async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}
async function rest(pathname, key) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_IMAGE_Z_V7_DEFAULT_REST");
}
async function queue(endpointId, pathname, key, options = {}) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), "AVANTIQO_IMAGE_Z_V7_DEFAULT_QUEUE");
}
async function queueCredentialWorks(endpointId, key) {
  try {
    const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    await response.arrayBuffer();
    return response.ok;
  } catch {
    return false;
  }
}
async function selectQueueCredential(endpointId, managementKey) {
  const candidates = [
    text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) ? { source: "RUNPOD_AVANTIQO_IMAGE_API_KEY", key: text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) } : null,
    text(process.env.RUNPOD_API_KEY) ? { source: "RUNPOD_API_KEY", key: text(process.env.RUNPOD_API_KEY) } : null,
    { source: "RUNPOD_MANAGEMENT_API_KEY", key: managementKey },
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (await queueCredentialWorks(endpointId, candidate.key)) return candidate;
  }
  throw new Error("AVANTIQO_IMAGE_Z_V7_DEFAULT_QUEUE_CREDENTIAL_NOT_FOUND");
}
async function readEvidence() {
  const evidence = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
  if (
    evidence?.success !== true ||
    text(evidence?.contract) !== EVIDENCE_CONTRACT ||
    text(evidence?.evidence_revision) !== EVIDENCE_REVISION ||
    evidence?.source_sha_matches_trigger !== true ||
    text(evidence?.entrypoint) !== EXPECTED_ENTRYPOINT ||
    text(evidence?.entrypoint_revision) !== EXPECTED_ENTRYPOINT_REVISION ||
    text(evidence?.runtime_revision) !== EXPECTED_RUNTIME ||
    text(evidence?.photoreal_candidate_foundation) !== FOUNDATION_MODEL ||
    text(evidence?.photoreal_candidate_profile) !== EXPECTED_PROFILE ||
    text(evidence?.photoreal_candidate_policy) !== EXPECTED_POLICY ||
    text(evidence?.photoreal_quality_compiler_contract) !== EXPECTED_COMPILER ||
    Number(evidence?.photoreal_default_inference_steps) !== EXPECTED_DEFAULT_STEPS ||
    Number(evidence?.photoreal_default_guidance_scale) !== EXPECTED_DEFAULT_CFG ||
    evidence?.photoreal_negative_policy_applied !== true ||
    evidence?.photoreal_prompt_rewrite_applied !== false ||
    evidence?.photoreal_compiled_prompt_persisted !== false ||
    evidence?.automatic_production_routing_enabled !== false
  ) throw new Error("AVANTIQO_IMAGE_Z_V7_DEFAULT_EVIDENCE_INVALID");
  const immutableImage = text(evidence.immutable_image_reference);
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-image-worker@sha256:[a-f0-9]{64}$/i.test(immutableImage)) {
    throw new Error("AVANTIQO_IMAGE_Z_V7_DEFAULT_IMMUTABLE_IMAGE_INVALID");
  }
  return { evidence, immutableImage };
}
async function endpointBoundTemplates(managementKey) {
  const raw = await rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey);
  const templates = normalizeListResponse(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_IMAGE_Z_V7_DEFAULT_TEMPLATE_LIST_INVALID");
  return templates;
}
function resolveEndpoint(endpoints, configuredId) {
  const matches = endpoints.filter((entry) => text(entry?.id) === configuredId && text(entry?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`AVANTIQO_IMAGE_Z_V7_DEFAULT_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}
function resolveTemplate(templates, templateId) {
  const matches = templates.filter((entry) => text(entry?.id) === templateId);
  if (matches.length !== 1) throw new Error(`AVANTIQO_IMAGE_Z_V7_DEFAULT_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}
async function cancelJob(endpointId, jobId, apiKey) {
  try {
    await queue(endpointId, `/cancel/${encodeURIComponent(jobId)}`, apiKey, { method: "POST" });
    console.log(`AVANTIQO_IMAGE_Z_V7_DEFAULT_CANCELLED_JOB=${jobId}`);
  } catch (error) {
    console.log(`AVANTIQO_IMAGE_Z_V7_DEFAULT_CANCEL_FAILED=${text(error?.message).slice(0, 300)}`);
  }
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(nodeMajor) || nodeMajor < 24) {
  throw new Error(`AVANTIQO_IMAGE_Z_V7_DEFAULT_NODE24_REQUIRED:actual=${process.version}`);
}
if (!process.argv.includes("--apply") || !yes(process.env.AVANTIQO_IMAGE_Z_V7_DEFAULT_APPROVED)) {
  throw new Error("AVANTIQO_IMAGE_Z_V7_DEFAULT_APPROVED=YES_AND_--apply_REQUIRED");
}

const { evidence, immutableImage } = await readEvidence();
const endpointId = required("RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const reportPath = resolve(process.env.AVANTIQO_IMAGE_Z_V7_DEFAULT_REPORT || DEFAULT_REPORT);
const localImagePath = resolve(process.env.AVANTIQO_IMAGE_Z_V7_DEFAULT_LOCAL_OUTPUT || DEFAULT_IMAGE);
const instruction = text(process.env.AVANTIQO_IMAGE_Z_V7_DEFAULT_INSTRUCTION) || DEFAULT_INSTRUCTION;

const endpointsRaw = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
const endpoints = normalizeListResponse(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
if (!endpoints) throw new Error("AVANTIQO_IMAGE_Z_V7_DEFAULT_ENDPOINT_LIST_INVALID");
const endpoint = resolveEndpoint(endpoints, endpointId);
if (finite(endpoint.workersMin, -1) !== 0 || finite(endpoint.workersMax, -1) !== 1) {
  throw new Error("AVANTIQO_IMAGE_Z_V7_DEFAULT_SCALING_INVALID");
}
const templates = await endpointBoundTemplates(managementKey);
const templateId = text(endpoint.templateId || endpoint.template?.id);
const template = resolveTemplate(templates, templateId);
if (text(template.imageName) !== immutableImage || !text(template.name).startsWith("avantiqo-image-immutable-v7-")) {
  throw new Error("AVANTIQO_IMAGE_Z_V7_DEFAULT_TEMPLATE_NOT_V7_IMMUTABLE");
}
const queueCredential = await selectQueueCredential(endpointId, managementKey);
const initialHealth = healthSummary(await queue(endpointId, "/health", queueCredential.key));
if (
  initialHealth.jobs.in_queue !== 0 ||
  initialHealth.jobs.in_progress !== 0 ||
  initialHealth.workers.running !== 0 ||
  initialHealth.workers.unhealthy !== 0
) throw new Error("AVANTIQO_IMAGE_Z_V7_DEFAULT_EXISTING_ACTIVITY_BLOCK");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const runId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
const remotePath = `platform-certification/owned-media-local/${runId}/outputs/z-image-v7-default-quality.png`;
const { data: uploadData, error: uploadError } = await supabase.storage
  .from(BUCKET)
  .createSignedUploadUrl(remotePath, { upsert: true });
if (uploadError || !uploadData?.signedUrl) {
  throw new Error(`AVANTIQO_IMAGE_Z_V7_DEFAULT_UPLOAD_TARGET_FAILED:${uploadError?.message || "NO_SIGNED_URL"}`);
}
const storageReference = `storage://${BUCKET}/${remotePath}`;

console.log(`AVANTIQO_IMAGE_Z_V7_DEFAULT_NODE=${process.version}`);
console.log(`AVANTIQO_IMAGE_Z_V7_DEFAULT_CONTRACT=${BENCHMARK_CONTRACT}`);
console.log(`AVANTIQO_IMAGE_Z_V7_DEFAULT_ENDPOINT_ID=${endpointId}`);
console.log(`AVANTIQO_IMAGE_Z_V7_DEFAULT_TEMPLATE_ID=${templateId}`);
console.log(`AVANTIQO_IMAGE_Z_V7_DEFAULT_IMMUTABLE_IMAGE=${immutableImage}`);
console.log(`AVANTIQO_IMAGE_Z_V7_DEFAULT_FOUNDATION=${FOUNDATION_MODEL}`);
console.log(`AVANTIQO_IMAGE_Z_V7_DEFAULT_DIMENSIONS=${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}`);
console.log(`AVANTIQO_IMAGE_Z_V7_DEFAULT_SEED=${SEED}`);
console.log("AVANTIQO_IMAGE_Z_V7_DEFAULT_REQUEST_INFERENCE_STEPS_OVERRIDE=false");
console.log("AVANTIQO_IMAGE_Z_V7_DEFAULT_REQUEST_GUIDANCE_SCALE_OVERRIDE=false");
console.log("AVANTIQO_IMAGE_Z_V7_DEFAULT_REQUEST_NEGATIVE_PROMPT_OVERRIDE=false");
console.log("AVANTIQO_IMAGE_Z_V7_DEFAULT_SINGLE_SUBMISSION=true");
console.log("AVANTIQO_IMAGE_Z_V7_DEFAULT_AUTOMATIC_RETRY=false");
console.log("AVANTIQO_IMAGE_Z_V7_DEFAULT_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_IMAGE_Z_V7_DEFAULT_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_Z_V7_DEFAULT_PRICING_ACTIVATION=false");
console.log("AVANTIQO_IMAGE_Z_V7_DEFAULT_SECRETS_PRINTED=false");

let submitted;
try {
  submitted = await queue(endpointId, "/run", queueCredential.key, {
    method: "POST",
    timeoutMs: 30_000,
    body: {
      input: {
        contract: ENGINE_CONTRACT,
        capability: "ai.image.generate",
        foundation_model: FOUNDATION_MODEL,
        organization_id: "benchmark-only",
        organization_service_id: "benchmark-only",
        usage_id: `benchmark-z-image-v7-default-${runId}`,
        instruction,
        structured_specification: {
          output_spec: {
            width: EXPECTED_WIDTH,
            height: EXPECTED_HEIGHT,
            aspect_ratio: "1:1",
          },
          provider_parameters: {
            seed: SEED,
          },
        },
        storage_upload: {
          signed_url: uploadData.signedUrl,
          storage_reference: storageReference,
        },
      },
    },
  });
} catch (error) {
  throw new Error(`AVANTIQO_IMAGE_Z_V7_DEFAULT_SUBMIT_RESULT_UNKNOWN_DO_NOT_RETRY:${text(error?.message).slice(0, 800)}`);
}

const jobId = text(submitted?.id);
if (!jobId) throw new Error("AVANTIQO_IMAGE_Z_V7_DEFAULT_JOB_ID_MISSING_DO_NOT_RETRY");
console.log(`AVANTIQO_IMAGE_Z_V7_DEFAULT_JOB_ID=${jobId}`);
console.log("AVANTIQO_IMAGE_Z_V7_DEFAULT_SUBMITTED_ONCE=YES");

const startedAt = Date.now();
let body = submitted;
let lastStatus = "";
while (Date.now() - startedAt < MAX_WAIT_MS) {
  const status = text(body?.status).toUpperCase();
  if (status !== lastStatus) {
    console.log(`AVANTIQO_IMAGE_Z_V7_DEFAULT_STATUS=${status || "UNKNOWN"}`);
    lastStatus = status;
  }
  if (status === "COMPLETED") break;
  if (terminalFailure(status)) {
    throw new Error(`AVANTIQO_IMAGE_Z_V7_DEFAULT_JOB_FAILED:job_id=${jobId}:status=${status}:error=${text(body?.error).slice(0, 1000)}`);
  }
  await sleep(POLL_MS);
  body = await queue(endpointId, `/status/${encodeURIComponent(jobId)}`, queueCredential.key);
}
if (text(body?.status).toUpperCase() !== "COMPLETED") {
  await cancelJob(endpointId, jobId, queueCredential.key);
  throw new Error(`AVANTIQO_IMAGE_Z_V7_DEFAULT_TIMEOUT_CANCELLED:job_id=${jobId}`);
}

const output = object(body.output);
const guidance = object(output.generation_guidance);
const checks = {
  capability: text(output.capability) === "ai.image.generate",
  foundation_model: text(output.foundation_model) === FOUNDATION_MODEL,
  foundation_model_source: text(output.foundation_model_source) === "runpod-cache",
  runtime_revision: text(output.runtime_revision) === EXPECTED_RUNTIME,
  width: Number(output.width) === EXPECTED_WIDTH,
  height: Number(output.height) === EXPECTED_HEIGHT,
  default_inference_steps_applied: Number(output.inference_steps) === EXPECTED_DEFAULT_STEPS,
  cfg_mode: text(guidance.mode).toUpperCase() === "CFG",
  default_cfg_applied: Number(guidance.scale) === EXPECTED_DEFAULT_CFG,
  negative_prompt_supplied_by_compiler: guidance.negative_prompt_supplied === true,
  negative_prompt_has_content: guidance.negative_prompt_has_content === true,
  quality_profile: text(guidance.quality_profile) === EXPECTED_PROFILE,
  quality_policy: text(guidance.quality_policy) === EXPECTED_POLICY,
  quality_compiler_contract: text(guidance.quality_compiler_contract) === EXPECTED_COMPILER,
  negative_policy_applied: guidance.negative_policy_applied === true,
  user_negative_prompt_not_present: guidance.user_negative_prompt_preserved === false,
  prompt_rewrite_disabled: guidance.prompt_rewrite_applied === false,
  positive_constraint_suffix_disabled: guidance.positive_constraint_suffix_applied === false,
  compiled_prompt_not_persisted: guidance.compiled_prompt_persisted === false,
  raw_reasoning_not_persisted: output.raw_reasoning_persisted === false,
  output_size: Number(output.size_bytes) > 10_000,
};
const passed = Object.values(checks).every(Boolean);

const { data: previewData, error: previewError } = await supabase.storage
  .from(BUCKET)
  .createSignedUrl(remotePath, 3600);
if (previewError || !previewData?.signedUrl) {
  throw new Error(`AVANTIQO_IMAGE_Z_V7_DEFAULT_PREVIEW_FAILED:${previewError?.message || "NO_SIGNED_URL"}`);
}
const imageResponse = await fetch(previewData.signedUrl, { signal: AbortSignal.timeout(60_000) });
if (!imageResponse.ok) throw new Error(`AVANTIQO_IMAGE_Z_V7_DEFAULT_DOWNLOAD_HTTP_${imageResponse.status}`);
const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
if (imageBytes.length < 10_000) throw new Error("AVANTIQO_IMAGE_Z_V7_DEFAULT_IMAGE_TOO_SMALL");
await mkdir(dirname(localImagePath), { recursive: true });
await writeFile(localImagePath, imageBytes);

const finalHealth = healthSummary(await queue(endpointId, "/health", queueCredential.key));
const report = {
  success: passed,
  contract: BENCHMARK_CONTRACT,
  generated_at: new Date().toISOString(),
  activation_allowed: false,
  endpoint: {
    id: endpointId,
    name: ENDPOINT_NAME,
    template_id: templateId,
    template_name: text(template.name),
    immutable_image: immutableImage,
  },
  source_evidence: {
    source_sha: text(evidence.source_sha),
    evidence_revision: EVIDENCE_REVISION,
    runtime_revision: EXPECTED_RUNTIME,
  },
  job_id: jobId,
  foundation_model: FOUNDATION_MODEL,
  width: Number(output.width) || null,
  height: Number(output.height) || null,
  inference_steps: Number(output.inference_steps) || null,
  cfg_scale: Number(guidance.scale) || null,
  seed: Number(output.seed) || SEED,
  size_bytes: Number(output.size_bytes) || imageBytes.length,
  generation_seconds: Number(output.generation_seconds) || null,
  execution_time_ms: Number(body.executionTime) || null,
  delay_time_ms: Number(body.delayTime) || null,
  storage_reference: storageReference,
  preview_url: previewData.signedUrl,
  local_image_path: localImagePath,
  request_quality_overrides: {
    inference_steps: false,
    guidance_scale: false,
    negative_prompt: false,
  },
  checks,
  generation_guidance: guidance,
  final_health: finalHealth,
  policy: {
    one_provider_job_submitted: true,
    automatic_retry: false,
    endpoint_mutation: false,
    production_deploy: false,
    pricing_activation: false,
    human_visual_review_required: true,
  },
  next_action: passed ? "HUMAN_REVIEW_FINAL_V7_DEFAULT_QUALITY_IMAGE" : "STOP_AND_INSPECT_V7_DEFAULT_QUALITY_CONTRACT",
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`AVANTIQO_IMAGE_Z_V7_DEFAULT_PREVIEW_URL=${previewData.signedUrl}`);
console.log(`AVANTIQO_IMAGE_Z_V7_DEFAULT_LOCAL_IMAGE=${localImagePath}`);
console.log(`AVANTIQO_IMAGE_Z_V7_DEFAULT_REPORT=${reportPath}`);
console.log(`AVANTIQO_IMAGE_Z_V7_DEFAULT_CHECKS=${JSON.stringify(checks)}`);
console.log(`AVANTIQO_IMAGE_Z_V7_DEFAULT_RESULT=${passed ? "PASS" : "FAIL"}`);
console.log(`AVANTIQO_IMAGE_Z_V7_DEFAULT_NEXT_ACTION=${report.next_action}`);
console.log(JSON.stringify({ success: passed, job_id: jobId, local_image_path: localImagePath, report_path: reportPath, activation_allowed: false }, null, 2));
if (!passed) process.exitCode = 2;
