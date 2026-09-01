import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const text = (v) => String(v ?? "").trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function required(name) { const v = text(process.env[name]); if (!v) throw new Error(`${name}_REQUIRED`); return v; }

const ENDPOINT_ID = required("RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID");
const RUNPOD_KEY = required("RUNPOD_AVANTIQO_VIDEO_API_KEY");
const SUPABASE_URL = required("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");
const ORG = required("AVANTIQO_VIDEO_SCENE1_ORGANIZATION_ID");
const PREPARED = path.resolve(required("AVANTIQO_VIDEO_SCENE1_PREPARED_FRAME"));
const OUTPUT = path.resolve(required("AVANTIQO_VIDEO_SCENE1_OUTPUT"));
const REPORT = path.resolve(required("AVANTIQO_VIDEO_SCENE1_REPORT"));
const RUN_ID = text(process.env.GITHUB_RUN_ID || Date.now()).replace(/[^A-Za-z0-9_-]/g, "");
const BUCKET = "creative-assets";
const API = `https://api.runpod.ai/v2/${ENDPOINT_ID}`;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const inputPath = `${ORG}/generated/avantiqo-video/.ltx25-inputs/scene1-prepared-${RUN_ID}.png`;
const outputPath = `${ORG}/generated/avantiqo-video/scene1-native-master-${RUN_ID}.mp4`;
const storageRef = (p) => `storage://${BUCKET}/${p}`;

async function uploadPrepared() {
  const bytes = await fs.readFile(PREPARED);
  if (bytes.length < 20_000) throw new Error("AVANTIQO_VIDEO_SCENE1_PREPARED_FRAME_INVALID");
  await supabase.storage.from(BUCKET).remove([inputPath]).catch(() => null);
  const { error } = await supabase.storage.from(BUCKET).upload(inputPath, bytes, { contentType: "image/png", upsert: false });
  if (error) throw error;
  const { data, error: signError } = await supabase.storage.from(BUCKET).createSignedUrl(inputPath, 7200);
  if (signError || !data?.signedUrl) throw signError || new Error("AVANTIQO_VIDEO_SCENE1_INPUT_SIGNED_URL_REQUIRED");
  return data.signedUrl;
}

async function outputUpload() {
  await supabase.storage.from(BUCKET).remove([outputPath]).catch(() => null);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(outputPath, { upsert: false });
  if (error || !data?.signedUrl) throw error || new Error("AVANTIQO_VIDEO_SCENE1_OUTPUT_SIGNED_URL_REQUIRED");
  return { signed_url: data.signedUrl, storage_reference: storageRef(outputPath) };
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${RUNPOD_KEY}`, "Content-Type": "application/json", ...(options.headers || {}) } });
  const raw = await response.text();
  let body = null; try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`RUNPOD_HTTP_${response.status}:${text(body?.error || body?.message || raw).slice(0,500)}`);
  return body;
}

async function submit(referenceUrl, upload) {
  const payload = {
    input: {
      contract: "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V2",
      capability: "ai.video.image_to_video",
      instruction: "A premium stabilized aerial push toward the dawn city skyline with a subtle controlled descent. Keep the architecture, skyline geometry and perspective coherent with the supplied opening frame. Natural pre-sunrise light slowly develops, with restrained realistic cloud movement, subtle water and traffic motion, physically plausible atmospheric depth, no artificial timelapse, no sudden camera movement, no morphing, no fantasy elements. The shot should feel like the opening of a world-class New York commercial film.",
      reference_images: [referenceUrl],
      reference_prepared: "true",
      output_upload: upload,
      duration_seconds: 5,
      fps: 24,
      seed: 4747,
      usage_id: `scene1-${RUN_ID}`,
    },
  };
  const result = await jsonFetch(`${API}/run`, { method: "POST", body: JSON.stringify(payload) });
  const id = text(result?.id);
  if (!id) throw new Error("AVANTIQO_VIDEO_SCENE1_RUNPOD_JOB_ID_REQUIRED");
  console.log(`AVANTIQO_VIDEO_SCENE1_JOB_ID=${id}`);
  return id;
}

async function waitJob(id) {
  const deadline = Date.now() + 45 * 60 * 1000;
  while (Date.now() < deadline) {
    const status = await jsonFetch(`${API}/status/${id}`);
    const state = text(status?.status).toUpperCase();
    console.log(`AVANTIQO_VIDEO_SCENE1_STATUS=${state || "UNKNOWN"}`);
    if (state === "COMPLETED") return status;
    if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(state)) throw new Error(`AVANTIQO_VIDEO_SCENE1_JOB_${state}:${text(status?.error || status?.output?.error_detail)}`);
    await sleep(15_000);
  }
  throw new Error("AVANTIQO_VIDEO_SCENE1_JOB_TIMEOUT");
}

async function downloadOutput() {
  const { data, error } = await supabase.storage.from(BUCKET).download(outputPath);
  if (error) throw error;
  const bytes = Buffer.from(await data.arrayBuffer());
  if (bytes.length <= 1_000_000) throw new Error("AVANTIQO_VIDEO_SCENE1_OUTPUT_TOO_SMALL");
  await fs.writeFile(OUTPUT, bytes);
  return bytes.length;
}

function probeOutput() {
  const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,codec_name,bit_rate", "-show_entries", "format=duration,bit_rate,size", "-of", "json", OUTPUT], { encoding: "utf8" });
  if (probe.status !== 0) throw new Error(`AVANTIQO_VIDEO_SCENE1_FFPROBE_FAILED:${text(probe.stderr || probe.stdout)}`);
  const parsed = JSON.parse(probe.stdout);
  const stream = parsed.streams?.[0] || {};
  if (Number(stream.width) !== 3840 || Number(stream.height) !== 2176) throw new Error(`AVANTIQO_VIDEO_SCENE1_DIMENSIONS_INVALID:${stream.width}x${stream.height}`);
  if (text(stream.r_frame_rate) !== "24/1") throw new Error(`AVANTIQO_VIDEO_SCENE1_FPS_INVALID:${stream.r_frame_rate}`);
  const duration = Number(parsed.format?.duration || 0);
  if (!(duration >= 4.8 && duration <= 5.3)) throw new Error(`AVANTIQO_VIDEO_SCENE1_DURATION_INVALID:${duration}`);
  return parsed;
}

function workerCount(health) {
  const workers = health?.workers;
  if (!workers || typeof workers !== "object") return 0;
  return Object.values(workers).reduce((sum, v) => sum + Number(v || 0), 0);
}

async function waitScaledZero() {
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    const health = await jsonFetch(`${API}/health`);
    const workers = workerCount(health);
    const inQueue = Number(health?.jobs?.inQueue ?? health?.jobs?.in_queue ?? 0);
    const inProgress = Number(health?.jobs?.inProgress ?? health?.jobs?.in_progress ?? 0);
    if (workers === 0 && inQueue === 0 && inProgress === 0) return health;
    await sleep(5_000);
  }
  throw new Error("AVANTIQO_VIDEO_SCENE1_WORKER_SCALE_ZERO_TIMEOUT");
}

let jobId = null;
try {
  const referenceUrl = await uploadPrepared();
  const upload = await outputUpload();
  jobId = await submit(referenceUrl, upload);
  const status = await waitJob(jobId);
  const output = status?.output || {};
  if (output?.success !== true) throw new Error(output?.error_code || "AVANTIQO_VIDEO_SCENE1_OUTPUT_FAILED");
  if (output?.pipeline !== "TI2VID_ONE_STAGE_FULL_DEV_BF16") throw new Error(`AVANTIQO_VIDEO_SCENE1_PIPELINE_INVALID:${text(output?.pipeline)}`);
  if (output?.pixel_upscale_used !== false || output?.learned_spatial_upscaler_used !== false || output?.distilled_lora_used !== false || output?.resize_used !== false || output?.crop_used !== false) throw new Error("AVANTIQO_VIDEO_SCENE1_NATIVE_MASTER_CONTRACT_BROKEN");
  if (output?.preprocessing_inside_paid_worker !== false || output?.ffprobe_inside_paid_worker !== false) throw new Error("AVANTIQO_VIDEO_SCENE1_PAID_WORKER_BOUNDARY_BROKEN");
  const size = await downloadOutput();
  const probe = probeOutput();
  const health = await waitScaledZero();
  const report = {
    success: true,
    endpoint_id: ENDPOINT_ID,
    job_id: jobId,
    pipeline: output.pipeline,
    model: output.foundation_model,
    precision: output.precision,
    cache_revision: output.cache_revision,
    generation_seconds: output.generation_seconds,
    width: output.width,
    height: output.height,
    fps: output.fps,
    frame_count: output.frame_count,
    seed: output.seed,
    output_size_bytes: size,
    storage_reference: storageRef(outputPath),
    native_master_generated: output.native_master_generated === true,
    pixel_upscale_used: output.pixel_upscale_used,
    learned_spatial_upscaler_used: output.learned_spatial_upscaler_used,
    distilled_lora_used: output.distilled_lora_used,
    preprocessing_inside_paid_worker: output.preprocessing_inside_paid_worker,
    ffprobe_inside_paid_worker: output.ffprobe_inside_paid_worker,
    post_gpu_probe: probe,
    final_health: health,
    production_deploy_performed: false,
  };
  await fs.writeFile(REPORT, JSON.stringify(report, null, 2));
  console.log("AVANTIQO_VIDEO_SCENE1_NATIVE_MASTER=PASS");
  console.log(`AVANTIQO_VIDEO_SCENE1_OUTPUT_BYTES=${size}`);
  console.log("AVANTIQO_VIDEO_SCENE1_WORKER_RETURNED_ZERO=true");
} finally {
  await supabase.storage.from(BUCKET).remove([inputPath]).catch(() => null);
}
