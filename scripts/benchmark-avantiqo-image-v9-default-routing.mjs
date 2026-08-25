import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const ENGINE_CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1";
const EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const EVIDENCE_REVISION = "AVANTIQO_IMAGE_WORKER_IMAGE_V9_Z_IMAGE_DEFAULT_ROUTING_V1";
const ENDPOINT_NAME = "avantiqo-image-v1";
const TARGET_MODEL = "Tongyi-MAI/Z-Image";
const EXPECTED_RUNTIME = "AVANTIQO_IMAGE_MULTI_FOUNDATION_PHYSICAL_VOLUME_USAGE_QUALITY_V4";
const EXPECTED_ROUTING = "AVANTIQO_IMAGE_Z_IMAGE_DEFAULT_GENERATION_ROUTING_V1";
const EXPECTED_PROFILE = "AVANTIQO_IMAGE_COMMERCIAL_PHOTOREAL_CANDIDATE_V3";
const EXPECTED_POLICY = "Z_IMAGE_RESTRAINED_PHOTOGRAPHIC_V3";
const EXPECTED_COMPILER = "AVANTIQO_IMAGE_Z_IMAGE_QUALITY_COMPILER_V2";
const EXPECTED_ANTITEXT = "AVANTIQO_IMAGE_Z_IMAGE_ANTITEXT_POLICY_V1";
const WIDTH = 1024;
const HEIGHT = 1024;
const SEED = 51000;
const BUCKET = "creative-assets";
const POLL_MS = 5000;
const MAX_WAIT_MS = Math.max(60000, Number(process.env.AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_TIMEOUT_MS || 12 * 60 * 1000));
const DEFAULT_IMAGE = "/tmp/avantiqo-image-v9-default-routing.png";
const DEFAULT_REPORT = "/tmp/avantiqo-image-v9-default-routing.json";
const INSTRUCTION = "Photorealistic premium restaurant advertising photograph of a freshly cooked ribeye steak on elegant dark stoneware, realistic natural searing and moisture, golden roasted potato wedges, herb butter melting naturally, restrained fresh vegetables, dark walnut and black stone restaurant table, warm professional food photography lighting, natural diner-level three-quarter camera angle, shallow depth of field, expensive luxury restaurant atmosphere, physically plausible food and reflections, no people, no hands, no text, no logo, no CGI appearance, no plastic texture.";

const text = (value) => String(value ?? "").trim();
const obj = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
function yes(value) { return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase()); }
function required(name, fallback = "") { const value = text(process.env[name] || fallback); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function normalizeList(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = normalizeList(value[key], keys, depth + 1);
    if (found) return found;
  }
  return null;
}
async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 800)}`);
  return body ?? {};
}
async function rest(pathname, key) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(30000) }), "AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_REST");
}
async function queue(endpointId, pathname, key, options = {}) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30000),
  }), "AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_QUEUE");
}
async function queueCredentialWorks(endpointId, key) {
  try {
    const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
    await response.arrayBuffer();
    return response.ok;
  } catch { return false; }
}
async function selectQueueCredential(endpointId, managementKey) {
  const candidates = [
    text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) ? { source: "RUNPOD_AVANTIQO_IMAGE_API_KEY", key: text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) } : null,
    text(process.env.RUNPOD_API_KEY) ? { source: "RUNPOD_API_KEY", key: text(process.env.RUNPOD_API_KEY) } : null,
    { source: "RUNPOD_MANAGEMENT_API_KEY", key: managementKey },
  ].filter(Boolean);
  for (const candidate of candidates) if (await queueCredentialWorks(endpointId, candidate.key)) return candidate;
  throw new Error("AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_QUEUE_CREDENTIAL_NOT_FOUND");
}
function terminalFailure(status) { return ["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(text(status).toUpperCase()); }

if (!process.argv.includes("--apply") || !yes(process.env.AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_APPROVED)) throw new Error("AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_APPROVED=YES_AND_--apply_REQUIRED");
if (Number(process.versions.node.split(".")[0]) < 24) throw new Error(`AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_NODE24_REQUIRED:${process.version}`);

const evidence = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
if (
  evidence?.success !== true ||
  text(evidence?.evidence_revision) !== EVIDENCE_REVISION ||
  text(evidence?.entrypoint) !== "handler_v9.py" ||
  text(evidence?.runtime_revision) !== EXPECTED_RUNTIME ||
  text(evidence?.configured_generation_foundation) !== TARGET_MODEL ||
  text(evidence?.default_generation_routing_contract) !== EXPECTED_ROUTING ||
  evidence?.default_generation_routing_enabled !== true ||
  evidence?.qwen_replaced_for_generate_default !== true ||
  evidence?.automatic_production_routing_enabled !== false
) throw new Error("AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_EVIDENCE_INVALID");
const immutableImage = text(evidence.immutable_image_reference);

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const endpointId = required("RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID");
const endpoints = normalizeList(await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey), ["endpoints", "serverlessEndpoints"]);
if (!endpoints) throw new Error("AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_ENDPOINT_LIST_INVALID");
const endpointMatches = endpoints.filter((entry) => text(entry?.id) === endpointId && text(entry?.name) === ENDPOINT_NAME);
if (endpointMatches.length !== 1) throw new Error(`AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_ENDPOINT_RESOLUTION_FAILED:${endpointMatches.length}`);
const endpoint = endpointMatches[0];
if (Number(endpoint.workersMin) !== 0 || Number(endpoint.workersMax) !== 1) throw new Error("AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_SCALING_INVALID");
const templatesRaw = await rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey);
const templates = normalizeList(templatesRaw, ["templates"]);
const templateId = text(endpoint.templateId || endpoint.template?.id);
const templateMatches = (templates || []).filter((entry) => text(entry?.id) === templateId);
if (templateMatches.length !== 1) throw new Error("AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_TEMPLATE_RESOLUTION_FAILED");
const template = templateMatches[0];
if (text(template.imageName) !== immutableImage || !text(template.name).startsWith("avantiqo-image-immutable-v9-")) throw new Error("AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_TEMPLATE_NOT_V9");
const credential = await selectQueueCredential(endpointId, managementKey);
const health = await queue(endpointId, "/health", credential.key);
const jobs = obj(health.jobs);
const workers = obj(health.workers);
if (Number(jobs.inQueue ?? jobs.in_queue ?? 0) !== 0 || Number(jobs.inProgress ?? jobs.in_progress ?? 0) !== 0 || Number(workers.running ?? 0) !== 0 || Number(workers.unhealthy ?? 0) !== 0) throw new Error("AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_EXISTING_ACTIVITY_BLOCK");

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const runId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
const remotePath = `platform-certification/owned-media-local/${runId}/outputs/z-image-v9-default-routing.png`;
const { data: uploadData, error: uploadError } = await supabase.storage.from(BUCKET).createSignedUploadUrl(remotePath, { upsert: true });
if (uploadError || !uploadData?.signedUrl) throw new Error(`AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_UPLOAD_TARGET_FAILED:${uploadError?.message || "NO_SIGNED_URL"}`);
const storageReference = `storage://${BUCKET}/${remotePath}`;

console.log("AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_FOUNDATION_MODEL_FIELD_SUPPLIED=false");
console.log("AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_NEGATIVE_PROMPT_OVERRIDE=false");
console.log("AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_INFERENCE_STEPS_OVERRIDE=false");
console.log("AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_GUIDANCE_SCALE_OVERRIDE=false");
console.log("AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_SINGLE_SUBMISSION=true");
console.log("AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_AUTOMATIC_RETRY=false");
console.log("AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_PRODUCTION_DEPLOY=false");

let submitted;
try {
  submitted = await queue(endpointId, "/run", credential.key, {
    method: "POST",
    body: {
      input: {
        contract: ENGINE_CONTRACT,
        capability: "ai.image.generate",
        organization_id: "benchmark-only",
        organization_service_id: "benchmark-only",
        usage_id: `benchmark-image-v9-default-routing-${runId}`,
        instruction: INSTRUCTION,
        structured_specification: {
          output_spec: { width: WIDTH, height: HEIGHT, aspect_ratio: "1:1" },
          provider_parameters: { seed: SEED },
        },
        storage_upload: { signed_url: uploadData.signedUrl, storage_reference: storageReference },
      },
    },
  });
} catch (error) {
  throw new Error(`AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_SUBMIT_RESULT_UNKNOWN_DO_NOT_RETRY:${text(error?.message).slice(0, 800)}`);
}
const jobId = text(submitted?.id);
if (!jobId) throw new Error("AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_JOB_ID_MISSING_DO_NOT_RETRY");
console.log(`AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_JOB_ID=${jobId}`);
let body = submitted;
const startedAt = Date.now();
while (Date.now() - startedAt < MAX_WAIT_MS) {
  const status = text(body?.status).toUpperCase();
  if (status === "COMPLETED") break;
  if (terminalFailure(status)) throw new Error(`AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_JOB_FAILED:${status}:${text(body?.error).slice(0, 800)}`);
  await sleep(POLL_MS);
  body = await queue(endpointId, `/status/${encodeURIComponent(jobId)}`, credential.key);
  console.log(JSON.stringify({ event: "AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_PROGRESS", job_id: jobId, status: text(body?.status).toUpperCase(), elapsed_seconds: Math.round((Date.now() - startedAt) / 1000) }));
}
if (text(body?.status).toUpperCase() !== "COMPLETED") {
  try { await queue(endpointId, `/cancel/${encodeURIComponent(jobId)}`, credential.key, { method: "POST" }); } catch {}
  throw new Error(`AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_TIMEOUT_CANCELLED:${jobId}`);
}

const output = obj(body.output);
const guidance = obj(output.generation_guidance);
const selection = obj(output.foundation_selection);
const checks = {
  foundation_model_selected_by_worker: text(output.foundation_model) === TARGET_MODEL,
  runtime_revision: text(output.runtime_revision) === EXPECTED_RUNTIME,
  default_generation_routing_applied: output.default_generation_routing_applied === true,
  default_generation_routing_contract: text(output.default_generation_routing_contract) === EXPECTED_ROUTING,
  selection_status: text(selection.selection_status) === "OWNED_DEFAULT_GENERATION_FOUNDATION",
  selected_foundation: text(selection.selected_foundation) === TARGET_MODEL,
  qwen_replaced_for_generate_default: selection.qwen_replaced_for_generate_default === true,
  default_steps: Number(output.inference_steps) === 28,
  default_cfg: Number(guidance.scale) === 4,
  quality_profile: text(guidance.quality_profile) === EXPECTED_PROFILE,
  quality_policy: text(guidance.quality_policy) === EXPECTED_POLICY,
  quality_compiler: text(guidance.quality_compiler_contract) === EXPECTED_COMPILER,
  antitext_policy: text(guidance.antitext_policy_contract) === EXPECTED_ANTITEXT,
  antitext_applied: guidance.antitext_policy_applied === true,
  no_user_negative_prompt: guidance.user_negative_prompt_preserved === false,
  prompt_rewrite_disabled: guidance.prompt_rewrite_applied === false,
  compiled_prompt_not_persisted: guidance.compiled_prompt_persisted === false,
  output_size: Number(output.size_bytes) > 10000,
};
const passed = Object.values(checks).every(Boolean);

const { data: previewData, error: previewError } = await supabase.storage.from(BUCKET).createSignedUrl(remotePath, 3600);
if (previewError || !previewData?.signedUrl) throw new Error(`AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_PREVIEW_FAILED:${previewError?.message || "NO_SIGNED_URL"}`);
const imageResponse = await fetch(previewData.signedUrl, { signal: AbortSignal.timeout(60000) });
if (!imageResponse.ok) throw new Error(`AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_DOWNLOAD_HTTP_${imageResponse.status}`);
const bytes = Buffer.from(await imageResponse.arrayBuffer());
const localImagePath = resolve(process.env.AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_LOCAL_OUTPUT || DEFAULT_IMAGE);
const reportPath = resolve(process.env.AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_REPORT || DEFAULT_REPORT);
await mkdir(dirname(localImagePath), { recursive: true });
await writeFile(localImagePath, bytes);
const report = {
  success: passed,
  contract: "AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_CERTIFICATE_V1",
  activation_allowed: false,
  job_id: jobId,
  endpoint_id: endpointId,
  template_id: templateId,
  immutable_image: immutableImage,
  request_foundation_model_supplied: false,
  selected_foundation_model: text(output.foundation_model),
  checks,
  preview_url: previewData.signedUrl,
  local_image_path: localImagePath,
  provider_jobs_submitted: 1,
  image_generation_submitted: true,
  model_download_submitted: false,
  endpoint_mutation_performed: false,
  production_web_deploy: false,
  pricing_activation: false,
  next_action: passed ? "HUMAN_REVIEW_V9_DEFAULT_ROUTING_IMAGE" : "STOP_AND_INSPECT_V9_DEFAULT_ROUTING",
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_PREVIEW_URL=${previewData.signedUrl}`);
console.log(`AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_LOCAL_IMAGE=${localImagePath}`);
console.log(`AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_REPORT=${reportPath}`);
console.log(`AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_CHECKS=${JSON.stringify(checks)}`);
console.log(`AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_RESULT=${passed ? "PASS" : "FAIL"}`);
console.log(`AVANTIQO_IMAGE_V9_DEFAULT_ROUTING_NEXT_ACTION=${report.next_action}`);
if (!passed) process.exitCode = 2;
