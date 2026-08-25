import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const API_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1";
const BENCHMARK_CONTRACT = "AVANTIQO_IMAGE_Z_IMAGE_V7_ANTITEXT_AB_V1";
const FOUNDATION_MODEL = "Tongyi-MAI/Z-Image";
const EXPECTED_RUNTIME = "AVANTIQO_IMAGE_MULTI_FOUNDATION_PHYSICAL_VOLUME_USAGE_QUALITY_V2";
const EXPECTED_PROFILE = "AVANTIQO_IMAGE_COMMERCIAL_PHOTOREAL_CANDIDATE_V2";
const EXPECTED_POLICY = "Z_IMAGE_RESTRAINED_PHOTOGRAPHIC_V2";
const EXPECTED_COMPILER = "AVANTIQO_IMAGE_Z_IMAGE_QUALITY_COMPILER_V1";
const WIDTH = 1024;
const HEIGHT = 1024;
const SEED = 51000;
const BUCKET = "creative-assets";
const POLL_MS = 5000;
const MAX_WAIT_MS = Math.max(60_000, Math.min(20 * 60 * 1000, Number(process.env.AVANTIQO_IMAGE_Z_V7_ANTITEXT_TIMEOUT_MS || 12 * 60 * 1000)));
const DEFAULT_REPORT = "/tmp/avantiqo-z-image-v7-antitext-ab.json";
const DEFAULT_IMAGE = "/tmp/avantiqo-z-image-v7-antitext-ab.png";

const INSTRUCTION = "Photorealistic premium restaurant advertising photograph of a freshly cooked ribeye steak on elegant dark stoneware, realistic natural searing and moisture, golden roasted potato wedges, herb butter melting naturally, restrained fresh vegetables, dark walnut and black stone restaurant table, warm professional food photography lighting, natural diner-level three-quarter camera angle, shallow depth of field, expensive luxury restaurant atmosphere, physically plausible food and reflections, no people, no hands, no text, no logo, no CGI appearance, no plastic texture.";

const ANTITEXT_NEGATIVE = [
  "text", "letters", "words", "characters", "numbers", "typography", "caption", "subtitle", "headline", "label",
  "logo", "brand mark", "emblem", "badge", "seal", "stamp", "watermark", "signature", "restaurant name", "menu text",
  "signage", "storefront sign", "wall sign", "printed sign", "poster", "advertising copy", "packaging text", "table card",
  "Chinese characters", "Japanese characters", "Korean characters", "Latin letters", "calligraphy", "pseudo-text", "gibberish text",
  "fake lettering", "decorative lettering", "unreadable lettering", "AI-generated text", "corner watermark", "corner logo", "overlay graphic",
].join(", ");

const text = (value) => String(value ?? "").trim();
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 1000)}`);
  return body ?? {};
}
async function queue(endpointId, path, key, options = {}) {
  return readJson(await fetch(`${API_BASE}/${encodeURIComponent(endpointId)}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), "AVANTIQO_IMAGE_Z_V7_ANTITEXT_QUEUE");
}
function healthJobs(value = {}) {
  const jobs = value.jobs || {};
  return {
    in_queue: Number(jobs.inQueue ?? jobs.in_queue ?? 0) || 0,
    in_progress: Number(jobs.inProgress ?? jobs.in_progress ?? 0) || 0,
  };
}
function terminalFailure(status) {
  return ["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(text(status).toUpperCase());
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(nodeMajor) || nodeMajor < 24) throw new Error(`AVANTIQO_IMAGE_Z_V7_ANTITEXT_NODE24_REQUIRED:${process.version}`);
if (!process.argv.includes("--apply") || !yes(process.env.AVANTIQO_IMAGE_Z_V7_ANTITEXT_APPROVED)) {
  throw new Error("AVANTIQO_IMAGE_Z_V7_ANTITEXT_APPROVED=YES_AND_--apply_REQUIRED");
}

const endpointId = required("RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID");
const apiKey = required("RUNPOD_AVANTIQO_IMAGE_API_KEY", process.env.RUNPOD_API_KEY);
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const localImagePath = resolve(process.env.AVANTIQO_IMAGE_Z_V7_ANTITEXT_LOCAL_OUTPUT || DEFAULT_IMAGE);
const reportPath = resolve(process.env.AVANTIQO_IMAGE_Z_V7_ANTITEXT_REPORT || DEFAULT_REPORT);

const initialHealth = healthJobs(await queue(endpointId, "/health", apiKey));
if (initialHealth.in_queue !== 0 || initialHealth.in_progress !== 0) {
  throw new Error(`AVANTIQO_IMAGE_Z_V7_ANTITEXT_EXISTING_JOB_BLOCK:in_queue=${initialHealth.in_queue}:in_progress=${initialHealth.in_progress}`);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const runId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
const remotePath = `platform-certification/owned-media-local/${runId}/outputs/z-image-v7-antitext-ab.png`;
const { data: uploadData, error: uploadError } = await supabase.storage.from(BUCKET).createSignedUploadUrl(remotePath, { upsert: true });
if (uploadError || !uploadData?.signedUrl) throw new Error(`AVANTIQO_IMAGE_Z_V7_ANTITEXT_UPLOAD_TARGET_FAILED:${uploadError?.message || "NO_SIGNED_URL"}`);
const storageReference = `storage://${BUCKET}/${remotePath}`;

console.log(`AVANTIQO_IMAGE_Z_V7_ANTITEXT_NODE=${process.version}`);
console.log(`AVANTIQO_IMAGE_Z_V7_ANTITEXT_CONTRACT=${BENCHMARK_CONTRACT}`);
console.log(`AVANTIQO_IMAGE_Z_V7_ANTITEXT_ENDPOINT_ID=${endpointId}`);
console.log(`AVANTIQO_IMAGE_Z_V7_ANTITEXT_FOUNDATION=${FOUNDATION_MODEL}`);
console.log(`AVANTIQO_IMAGE_Z_V7_ANTITEXT_DIMENSIONS=${WIDTH}x${HEIGHT}`);
console.log(`AVANTIQO_IMAGE_Z_V7_ANTITEXT_SEED=${SEED}`);
console.log("AVANTIQO_IMAGE_Z_V7_ANTITEXT_POSITIVE_BRIEF_CHANGED=false");
console.log("AVANTIQO_IMAGE_Z_V7_ANTITEXT_STEPS_OVERRIDE=false");
console.log("AVANTIQO_IMAGE_Z_V7_ANTITEXT_CFG_OVERRIDE=false");
console.log("AVANTIQO_IMAGE_Z_V7_ANTITEXT_ONLY_VARIABLE=NEGATIVE_TEXT_LOGO_POLICY");
console.log("AVANTIQO_IMAGE_Z_V7_ANTITEXT_SINGLE_SUBMISSION=true");
console.log("AVANTIQO_IMAGE_Z_V7_ANTITEXT_AUTOMATIC_RETRY=false");
console.log("AVANTIQO_IMAGE_Z_V7_ANTITEXT_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_Z_V7_ANTITEXT_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_IMAGE_Z_V7_ANTITEXT_SECRETS_PRINTED=false");

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
        usage_id: `benchmark-z-image-v7-antitext-${runId}`,
        instruction: INSTRUCTION,
        structured_specification: {
          output_spec: { width: WIDTH, height: HEIGHT, aspect_ratio: "1:1" },
          provider_parameters: { seed: SEED, negative_prompt: ANTITEXT_NEGATIVE },
        },
        storage_upload: { signed_url: uploadData.signedUrl, storage_reference: storageReference },
      },
    },
  });
} catch (error) {
  throw new Error(`AVANTIQO_IMAGE_Z_V7_ANTITEXT_SUBMIT_RESULT_UNKNOWN_DO_NOT_RETRY:${text(error?.message).slice(0, 800)}`);
}

const jobId = text(submitted?.id);
if (!jobId) throw new Error("AVANTIQO_IMAGE_Z_V7_ANTITEXT_JOB_ID_MISSING_DO_NOT_RETRY");
console.log(`AVANTIQO_IMAGE_Z_V7_ANTITEXT_JOB_ID=${jobId}`);
console.log("AVANTIQO_IMAGE_Z_V7_ANTITEXT_SUBMITTED_ONCE=YES");

const startedAt = Date.now();
let body = submitted;
let lastStatus = "";
while (Date.now() - startedAt < MAX_WAIT_MS) {
  const status = text(body?.status).toUpperCase();
  if (status !== lastStatus) {
    console.log(`AVANTIQO_IMAGE_Z_V7_ANTITEXT_STATUS=${status || "UNKNOWN"}`);
    lastStatus = status;
  }
  if (status === "COMPLETED") break;
  if (terminalFailure(status)) throw new Error(`AVANTIQO_IMAGE_Z_V7_ANTITEXT_JOB_FAILED:${status}:${text(body?.error).slice(0, 1000)}`);
  await sleep(POLL_MS);
  body = await queue(endpointId, `/status/${encodeURIComponent(jobId)}`, apiKey);
}
if (text(body?.status).toUpperCase() !== "COMPLETED") {
  try { await queue(endpointId, `/cancel/${encodeURIComponent(jobId)}`, apiKey, { method: "POST" }); } catch {}
  throw new Error(`AVANTIQO_IMAGE_Z_V7_ANTITEXT_TIMEOUT_CANCELLED:${jobId}`);
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
  default_steps_preserved: Number(output.inference_steps) === 28,
  default_cfg_preserved: Number(guidance.scale) === 4,
  quality_profile: text(guidance.quality_profile) === EXPECTED_PROFILE,
  quality_policy: text(guidance.quality_policy) === EXPECTED_POLICY,
  quality_compiler: text(guidance.quality_compiler_contract) === EXPECTED_COMPILER,
  negative_policy_applied: guidance.negative_policy_applied === true,
  user_negative_preserved: guidance.user_negative_prompt_preserved === true,
  prompt_rewrite_disabled: guidance.prompt_rewrite_applied === false,
  positive_suffix_disabled: guidance.positive_constraint_suffix_applied === false,
  output_size: Number(output.size_bytes) > 10_000,
};
const passed = Object.values(checks).every(Boolean);

const { data: previewData, error: previewError } = await supabase.storage.from(BUCKET).createSignedUrl(remotePath, 3600);
if (previewError || !previewData?.signedUrl) throw new Error(`AVANTIQO_IMAGE_Z_V7_ANTITEXT_PREVIEW_FAILED:${previewError?.message || "NO_SIGNED_URL"}`);
const imageResponse = await fetch(previewData.signedUrl, { signal: AbortSignal.timeout(60_000) });
if (!imageResponse.ok) throw new Error(`AVANTIQO_IMAGE_Z_V7_ANTITEXT_DOWNLOAD_HTTP_${imageResponse.status}`);
const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
if (imageBytes.length < 10_000) throw new Error("AVANTIQO_IMAGE_Z_V7_ANTITEXT_IMAGE_TOO_SMALL");
await mkdir(dirname(localImagePath), { recursive: true });
await writeFile(localImagePath, imageBytes);

const report = {
  success: passed,
  contract: BENCHMARK_CONTRACT,
  activation_allowed: false,
  job_id: jobId,
  local_image_path: localImagePath,
  preview_url: previewData.signedUrl,
  storage_reference: storageReference,
  controlled_variable: "NEGATIVE_TEXT_LOGO_POLICY_ONLY",
  checks,
  generation_guidance: guidance,
  policy: {
    one_provider_job_submitted: true,
    automatic_retry: false,
    production_deploy: false,
    endpoint_mutation: false,
    human_visual_review_required: true,
  },
  next_action: passed ? "HUMAN_COMPARE_V7_DEFAULT_VS_V7_ANTITEXT" : "STOP_AND_INSPECT_V7_ANTITEXT_TRANSPORT",
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`AVANTIQO_IMAGE_Z_V7_ANTITEXT_PREVIEW_URL=${previewData.signedUrl}`);
console.log(`AVANTIQO_IMAGE_Z_V7_ANTITEXT_LOCAL_IMAGE=${localImagePath}`);
console.log(`AVANTIQO_IMAGE_Z_V7_ANTITEXT_REPORT=${reportPath}`);
console.log(`AVANTIQO_IMAGE_Z_V7_ANTITEXT_CHECKS=${JSON.stringify(checks)}`);
console.log(`AVANTIQO_IMAGE_Z_V7_ANTITEXT_RESULT=${passed ? "PASS" : "FAIL"}`);
console.log(`AVANTIQO_IMAGE_Z_V7_ANTITEXT_NEXT_ACTION=${report.next_action}`);
console.log(JSON.stringify({ success: passed, job_id: jobId, local_image_path: localImagePath, report_path: reportPath, activation_allowed: false }, null, 2));
if (!passed) process.exitCode = 2;
