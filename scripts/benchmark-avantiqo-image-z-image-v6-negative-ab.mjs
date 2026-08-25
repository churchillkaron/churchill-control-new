import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const API_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1";
const BENCHMARK_CONTRACT = "AVANTIQO_IMAGE_Z_IMAGE_V6_NEGATIVE_POLICY_AB_V1";
const FOUNDATION_MODEL = "Tongyi-MAI/Z-Image";
const EXPECTED_RUNTIME = "AVANTIQO_IMAGE_MULTI_FOUNDATION_PHYSICAL_VOLUME_USAGE_V1";
const EXPECTED_POLICY = "Z_IMAGE_RESTRAINED_PHOTOGRAPHIC_V1";
const EXPECTED_PROFILE = "AVANTIQO_IMAGE_COMMERCIAL_PHOTOREAL_CANDIDATE_V1";
const WIDTH = 1024;
const HEIGHT = 1024;
const INFERENCE_STEPS = 28;
const CFG_SCALE = 4.0;
const SEED = 51000;
const BUCKET = "creative-assets";
const POLL_MS = 5000;
const MAX_WAIT_MS = Math.max(
  60_000,
  Math.min(25 * 60 * 1000, Number(process.env.AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_TIMEOUT_MS || 15 * 60 * 1000)),
);
const DEFAULT_REPORT = "/tmp/avantiqo-z-image-v6-negative-ab.json";
const DEFAULT_LOCAL_IMAGE = "/tmp/avantiqo-z-image-v6-negative-ab.png";

const INSTRUCTION = "Photorealistic premium restaurant advertising photograph of a freshly cooked ribeye steak on elegant dark stoneware, realistic natural searing and moisture, golden roasted potato wedges, herb butter melting naturally, restrained fresh vegetables, dark walnut and black stone restaurant table, warm professional food photography lighting, natural diner-level three-quarter camera angle, shallow depth of field, expensive luxury restaurant atmosphere, physically plausible food and reflections, no people, no hands, no text, no logo, no CGI appearance, no plastic texture.";

const NEGATIVE_POLICY = [
  "CGI",
  "3D render",
  "illustration",
  "plastic skin",
  "plastic food",
  "waxy food",
  "lacquered food",
  "polished resin food",
  "artificial food shine",
  "mirror-gloss sauce",
  "overly smooth meat",
  "rubbery meat",
  "wrinkled repetitive meat grain",
  "repeated texture",
  "perfect grill grid",
  "geometric steak",
  "cylindrical steak",
  "molded meat",
  "oversized food",
  "perfect repeated potato shapes",
  "identical vegetables",
  "mathematically repeated plating",
  "synthetic stock-photo symmetry",
  "excessive bokeh",
  "overly blurred food edges",
  "impossible reflections",
  "text",
  "watermark",
].join(", ");

function text(value) {
  return String(value ?? "").trim();
}
function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
}
function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
function terminalFailure(status) {
  return ["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(text(status).toUpperCase());
}
async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.error || body?.message || body?.detail || raw).slice(0, 1000);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}
async function queue(endpointId, path, apiKey, options = {}) {
  return readJson(
    await fetch(`${API_BASE}/${encodeURIComponent(endpointId)}${path}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs || 30_000),
    }),
    "AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_QUEUE",
  );
}
function healthJobs(body = {}) {
  const jobs = body.jobs || {};
  return {
    in_queue: Number(jobs.inQueue ?? jobs.in_queue ?? 0) || 0,
    in_progress: Number(jobs.inProgress ?? jobs.in_progress ?? 0) || 0,
  };
}
async function cancelJob(endpointId, jobId, apiKey) {
  const body = await queue(endpointId, `/cancel/${encodeURIComponent(jobId)}`, apiKey, { method: "POST" });
  console.log(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_CANCELLED_JOB=${jobId}`);
  return body;
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(nodeMajor) || nodeMajor < 24) {
  throw new Error(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_NODE24_REQUIRED:actual=${process.version}`);
}
if (!process.argv.includes("--apply") || !yes(process.env.AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_APPROVED)) {
  throw new Error("AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_APPROVED=YES_AND_--apply_REQUIRED");
}

const endpointId = required("RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID");
const apiKey = required("RUNPOD_AVANTIQO_IMAGE_API_KEY", process.env.RUNPOD_API_KEY);
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const reportPath = resolve(process.env.AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_REPORT || DEFAULT_REPORT);
const localImagePath = resolve(process.env.AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_LOCAL_OUTPUT || DEFAULT_LOCAL_IMAGE);
const runId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
const remotePath = `platform-certification/owned-media-local/${runId}/outputs/z-image-v6-negative-ab.png`;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

console.log(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_NODE=${process.version}`);
console.log(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_CONTRACT=${BENCHMARK_CONTRACT}`);
console.log(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_FOUNDATION=${FOUNDATION_MODEL}`);
console.log(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_DIMENSIONS=${WIDTH}x${HEIGHT}`);
console.log(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_STEPS=${INFERENCE_STEPS}`);
console.log(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_CFG=${CFG_SCALE}`);
console.log(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_SEED=${SEED}`);
console.log("AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_POSITIVE_BRIEF_CHANGED=false");
console.log("AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_NEGATIVE_POLICY_CHANGED=true");
console.log("AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_SINGLE_SUBMISSION=true");
console.log("AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_AUTOMATIC_RETRY=false");
console.log("AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_SECRETS_PRINTED=false");

const initialHealth = healthJobs(await queue(endpointId, "/health", apiKey));
if (initialHealth.in_queue !== 0 || initialHealth.in_progress !== 0) {
  throw new Error(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_EXISTING_JOB_BLOCK:in_queue=${initialHealth.in_queue}:in_progress=${initialHealth.in_progress}`);
}

const { data: uploadData, error: uploadError } = await supabase.storage
  .from(BUCKET)
  .createSignedUploadUrl(remotePath, { upsert: true });
if (uploadError || !uploadData?.signedUrl) {
  throw new Error(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_UPLOAD_TARGET_FAILED:${uploadError?.message || "NO_SIGNED_URL"}`);
}
const storageReference = `storage://${BUCKET}/${remotePath}`;

let submitted;
try {
  submitted = await queue(endpointId, "/run", apiKey, {
    method: "POST",
    timeoutMs: 30_000,
    body: {
      input: {
        contract: CONTRACT,
        capability: "ai.image.generate",
        foundation_model: FOUNDATION_MODEL,
        organization_id: "benchmark-only",
        organization_service_id: "benchmark-only",
        usage_id: `benchmark-z-image-negative-ab-${runId}`,
        instruction: INSTRUCTION,
        structured_specification: {
          output_spec: { width: WIDTH, height: HEIGHT, aspect_ratio: "1:1" },
          provider_parameters: {
            seed: SEED,
            inference_steps: INFERENCE_STEPS,
            true_cfg_scale: CFG_SCALE,
            negative_prompt: NEGATIVE_POLICY,
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
  throw new Error(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_SUBMIT_RESULT_UNKNOWN_DO_NOT_RETRY:${text(error?.message).slice(0, 800)}`);
}

const jobId = text(submitted?.id);
if (!jobId) throw new Error("AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_JOB_ID_MISSING_DO_NOT_RETRY");
console.log(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_JOB_ID=${jobId}`);
console.log("AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_SUBMITTED_ONCE=YES");

const startedAt = Date.now();
let body = submitted;
let lastStatus = "";
while (Date.now() - startedAt < MAX_WAIT_MS) {
  const status = text(body?.status).toUpperCase();
  if (status !== lastStatus) {
    console.log(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_STATUS=${status || "UNKNOWN"}`);
    lastStatus = status;
  }
  if (status === "COMPLETED") break;
  if (terminalFailure(status)) {
    throw new Error(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_JOB_FAILED:job_id=${jobId}:status=${status}:error=${text(body?.error).slice(0, 1000)}`);
  }
  await sleep(POLL_MS);
  body = await queue(endpointId, `/status/${encodeURIComponent(jobId)}`, apiKey);
}

if (text(body?.status).toUpperCase() !== "COMPLETED") {
  await cancelJob(endpointId, jobId, apiKey);
  throw new Error(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_TIMEOUT_CANCELLED:job_id=${jobId}`);
}

const output = body.output || {};
const guidance = output.generation_guidance || {};
const checks = {
  capability: text(output.capability) === "ai.image.generate",
  foundation_model: text(output.foundation_model) === FOUNDATION_MODEL,
  foundation_model_source: text(output.foundation_model_source) === "runpod-cache",
  runtime_revision: text(output.runtime_revision) === EXPECTED_RUNTIME,
  width: Number(output.width) === WIDTH,
  height: Number(output.height) === HEIGHT,
  inference_steps: Number(output.inference_steps) === INFERENCE_STEPS,
  cfg_mode: text(guidance.mode).toUpperCase() === "CFG",
  cfg_scale: Number(guidance.scale) === CFG_SCALE,
  negative_prompt_supplied: guidance.negative_prompt_supplied === true,
  negative_prompt_has_content: guidance.negative_prompt_has_content === true,
  quality_policy: text(guidance.quality_policy) === EXPECTED_POLICY,
  quality_profile: text(guidance.quality_profile) === EXPECTED_PROFILE,
  prompt_rewrite_disabled: guidance.prompt_rewrite_applied === false,
  positive_constraint_suffix_disabled: guidance.positive_constraint_suffix_applied === false,
  raw_reasoning_not_persisted: output.raw_reasoning_persisted === false,
  output_size: Number(output.size_bytes) > 10_000,
};
const passed = Object.values(checks).every(Boolean);

const { data: previewData, error: previewError } = await supabase.storage
  .from(BUCKET)
  .createSignedUrl(remotePath, 3600);
if (previewError || !previewData?.signedUrl) {
  throw new Error(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_PREVIEW_FAILED:${previewError?.message || "NO_SIGNED_URL"}`);
}
const imageResponse = await fetch(previewData.signedUrl, { signal: AbortSignal.timeout(60_000) });
if (!imageResponse.ok) throw new Error(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_DOWNLOAD_HTTP_${imageResponse.status}`);
const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
if (imageBytes.length < 10_000) throw new Error("AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_IMAGE_TOO_SMALL");
await mkdir(dirname(localImagePath), { recursive: true });
await writeFile(localImagePath, imageBytes);

const report = {
  success: passed,
  contract: BENCHMARK_CONTRACT,
  generated_at: new Date().toISOString(),
  activation_allowed: false,
  endpoint_id: endpointId,
  job_id: jobId,
  foundation_model: FOUNDATION_MODEL,
  runtime_revision: text(output.runtime_revision),
  width: Number(output.width) || null,
  height: Number(output.height) || null,
  inference_steps: Number(output.inference_steps) || null,
  cfg_scale: Number(guidance.scale) || null,
  seed: Number(output.seed) || SEED,
  generation_seconds: Number(output.generation_seconds) || null,
  execution_time_ms: Number(body.executionTime) || null,
  delay_time_ms: Number(body.delayTime) || null,
  storage_reference: storageReference,
  preview_url: previewData.signedUrl,
  local_image_path: localImagePath,
  ab_control: {
    positive_instruction_unchanged_from_first_28_step_test: true,
    seed_unchanged: true,
    dimensions_unchanged: true,
    inference_steps_unchanged: true,
    cfg_unchanged: true,
    only_negative_policy_changed: true,
    negative_policy_persisted: false,
  },
  checks,
  generation_guidance: guidance,
  policy: {
    one_provider_job_submitted: true,
    automatic_retry: false,
    production_deploy: false,
    pricing_activation: false,
    endpoint_mutation: false,
    human_visual_review_required: true,
  },
  next_action: passed ? "HUMAN_COMPARE_BASELINE_28_VS_NEGATIVE_POLICY_28" : "STOP_AND_INSPECT_NEGATIVE_POLICY_AB_CONTRACT",
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_PREVIEW_URL=${previewData.signedUrl}`);
console.log(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_LOCAL_IMAGE=${localImagePath}`);
console.log(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_REPORT=${reportPath}`);
console.log(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_CHECKS=${JSON.stringify(checks)}`);
console.log(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_RESULT=${passed ? "PASS" : "FAIL"}`);
console.log(`AVANTIQO_IMAGE_Z_V6_NEGATIVE_AB_NEXT_ACTION=${report.next_action}`);
console.log(JSON.stringify({ success: passed, job_id: jobId, local_image_path: localImagePath, report_path: reportPath, activation_allowed: false }, null, 2));
if (!passed) process.exitCode = 2;
