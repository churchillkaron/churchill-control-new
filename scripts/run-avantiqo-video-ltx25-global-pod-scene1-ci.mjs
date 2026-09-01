import crypto from "node:crypto";
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const text = (v) => String(v ?? "").trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const obj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
function required(name) { const v = text(process.env[name]); if (!v) throw new Error(`${name}_REQUIRED`); return v; }

const ENDPOINT_ID = required("RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID");
const MGMT_KEY = required("RUNPOD_MANAGEMENT_API_KEY");
const QUEUE_KEY = required("RUNPOD_AVANTIQO_VIDEO_API_KEY");
const HF_TOKEN = required("HF_TOKEN");
const IMAGE = required("AVANTIQO_VIDEO_LTX25_IMAGE");
const SUPABASE_URL = required("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");
const ORG = required("AVANTIQO_VIDEO_SCENE1_ORGANIZATION_ID");
const PREPARED = path.resolve(required("AVANTIQO_VIDEO_SCENE1_PREPARED_FRAME"));
const OUTPUT = path.resolve(required("AVANTIQO_VIDEO_SCENE1_OUTPUT"));
const REPORT = path.resolve(required("AVANTIQO_VIDEO_SCENE1_REPORT"));
const RUN_ID = text(process.env.GITHUB_RUN_ID || Date.now()).replace(/[^A-Za-z0-9_-]/g, "");
const REST = "https://rest.runpod.io/v1";
const QUEUE = `https://api.runpod.ai/v2/${ENDPOINT_ID}`;
const BUCKET = "creative-assets";
const GPU_POOL = [
  "NVIDIA B200",
  "NVIDIA H200",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
  "NVIDIA H100 NVL",
  "NVIDIA H100 80GB HBM3",
  "NVIDIA H100 PCIe",
  "NVIDIA A100-SXM4-80GB",
  "NVIDIA A100 80GB PCIe",
];
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function jsonFetch(url, key, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
    signal: AbortSignal.timeout(options.timeoutMs || 45_000),
  });
  const raw = await response.text();
  let body = null; try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`RUNPOD_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0,700)}`);
  return body;
}
async function rest(p, options = {}) { return jsonFetch(`${REST}${p}`, MGMT_KEY, options); }
async function queue(p, options = {}) { return jsonFetch(`${QUEUE}${p}`, QUEUE_KEY, options); }

async function removeStorage(p) { await supabase.storage.from(BUCKET).remove([p]).catch(() => null); }
async function signedUpload(p) {
  await removeStorage(p);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(p, { upsert: false });
  if (error || !data?.signedUrl) throw error || new Error("SIGNED_UPLOAD_REQUIRED");
  return { signed_url: data.signedUrl, storage_reference: `storage://${BUCKET}/${p}` };
}
async function uploadPrepared(p) {
  const bytes = await fs.readFile(PREPARED);
  if (bytes.length < 20_000) throw new Error("PREPARED_FRAME_INVALID");
  await removeStorage(p);
  const { error } = await supabase.storage.from(BUCKET).upload(p, bytes, { contentType: "image/png", upsert: false });
  if (error) throw error;
  const { data, error: signError } = await supabase.storage.from(BUCKET).createSignedUrl(p, 4 * 60 * 60);
  if (signError || !data?.signedUrl) throw signError || new Error("PREPARED_SIGNED_URL_REQUIRED");
  return data.signedUrl;
}
async function readJsonStorage(p) {
  const { data, error } = await supabase.storage.from(BUCKET).download(p);
  if (error) {
    const code = Number(error.statusCode ?? error.status ?? 0);
    if ([400, 404].includes(code) || text(error.message).toLowerCase().includes("not found")) return null;
    throw error;
  }
  return JSON.parse(await data.text());
}
async function downloadStorage(p, target) {
  const { data, error } = await supabase.storage.from(BUCKET).download(p);
  if (error) throw error;
  const bytes = Buffer.from(await data.arrayBuffer());
  if (bytes.length <= 1_000_000) throw new Error("SCENE1_OUTPUT_TOO_SMALL");
  await fs.writeFile(target, bytes);
  return bytes.length;
}

function activePod(pod = {}) {
  const s = text(pod.status || pod.runtimeStatus || pod.desiredStatus).toUpperCase();
  return !["EXITED", "TERMINATED", "DELETED", "STOPPED"].includes(s);
}
async function deletePod(id) {
  if (!id) return;
  await rest(`/pods/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
  for (let i = 0; i < 36; i++) {
    const pod = await rest(`/pods/${encodeURIComponent(id)}`).catch(() => null);
    if (!pod || !activePod(pod)) return;
    await sleep(5_000);
  }
}

async function quiesceServerless() {
  const endpoint = await rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`);
  if (text(endpoint.id) !== ENDPOINT_ID || text(endpoint.name) !== "avantiqo-cinema-production-v1") throw new Error("SERVERLESS_ENDPOINT_INVALID");
  await queue("/purge-queue", { method: "POST" });
  await rest(`/endpoints/${ENDPOINT_ID}`, { method: "PATCH", body: JSON.stringify({ workersMin: 0, workersMax: 0 }) });
  for (let i = 0; i < 36; i++) {
    const h = await queue("/health");
    const workers = Object.values(obj(h.workers)).reduce((sum, v) => sum + Number(v || 0), 0);
    const queued = Number(h.jobs?.inQueue ?? h.jobs?.in_queue ?? 0);
    const progress = Number(h.jobs?.inProgress ?? h.jobs?.in_progress ?? 0);
    if (workers === 0 && queued === 0 && progress === 0) {
      console.log("AVANTIQO_VIDEO_GLOBAL_POD_SERVERLESS_QUIESCENT=true");
      return;
    }
    await sleep(5_000);
  }
  throw new Error("SERVERLESS_QUIESCE_TIMEOUT");
}

async function createPod(env) {
  const body = {
    allowedCudaVersions: ["12.8", "12.9", "13.0"],
    cloudType: "SECURE",
    computeType: "GPU",
    containerDiskInGb: 150,
    dataCenterPriority: "availability",
    dockerEntrypoint: [],
    dockerStartCmd: ["python", "-u", "/app/pod_once.py"],
    env,
    gpuCount: 1,
    gpuTypeIds: GPU_POOL,
    gpuTypePriority: "availability",
    imageName: IMAGE,
    interruptible: false,
    minRAMPerGPU: 64,
    minVCPUPerGPU: 8,
    name: `avantiqo-video-scene1-global-${RUN_ID}`.slice(0, 100),
    ports: [],
  };
  const created = await rest("/pods", { method: "POST", body: JSON.stringify(body), timeoutMs: 60_000 });
  const id = text(created?.id ?? created?.pod?.id ?? created?.data?.id);
  if (!id) throw new Error(`POD_ID_REQUIRED:${JSON.stringify(created).slice(0,500)}`);
  console.log(`AVANTIQO_VIDEO_GLOBAL_POD_ID=${id}`);
  return id;
}

async function waitReceipt(receiptPath, podId) {
  const deadline = Date.now() + 55 * 60 * 1000;
  while (Date.now() < deadline) {
    const receipt = await readJsonStorage(receiptPath);
    if (receipt) return receipt;
    const pod = await rest(`/pods/${encodeURIComponent(podId)}`).catch(() => null);
    if (!pod) throw new Error("GLOBAL_POD_DISAPPEARED_WITHOUT_RECEIPT");
    const status = text(pod.status || pod.runtimeStatus || pod.desiredStatus).toUpperCase();
    const gpu = text(pod?.machine?.gpuTypeId || pod?.machine?.gpuType?.id || pod?.gpuTypeId);
    console.log(`AVANTIQO_VIDEO_GLOBAL_POD_STATUS=${status || "UNKNOWN"}${gpu ? `:GPU=${gpu}` : ""}`);
    if (!activePod(pod)) throw new Error(`GLOBAL_POD_EXITED_WITHOUT_RECEIPT:${status}`);
    await sleep(15_000);
  }
  throw new Error("GLOBAL_POD_RECEIPT_TIMEOUT");
}

function probeOutput() {
  const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,codec_name", "-show_entries", "format=duration,size", "-of", "json", OUTPUT], { encoding: "utf8" });
  if (probe.status !== 0) throw new Error(`FFPROBE_FAILED:${text(probe.stderr || probe.stdout)}`);
  const parsed = JSON.parse(probe.stdout);
  const stream = parsed.streams?.[0] || {};
  if (Number(stream.width) !== 3840 || Number(stream.height) !== 2176) throw new Error(`DIMENSIONS_INVALID:${stream.width}x${stream.height}`);
  if (text(stream.r_frame_rate) !== "24/1") throw new Error(`FPS_INVALID:${stream.r_frame_rate}`);
  const duration = Number(parsed.format?.duration || 0);
  if (!(duration >= 4.8 && duration <= 5.3)) throw new Error(`DURATION_INVALID:${duration}`);
  return parsed;
}

const inputPath = `${ORG}/generated/avantiqo-video/.ltx25-inputs/scene1-global-pod-${RUN_ID}.png`;
const outputPath = `${ORG}/generated/avantiqo-video/scene1-native-master-global-pod-${RUN_ID}.mp4`;
const receiptPath = `${ORG}/generated/avantiqo-video/.ltx25-receipts/scene1-global-pod-${RUN_ID}.json`;
let podId = null;
try {
  await quiesceServerless();
  const referenceUrl = await uploadPrepared(inputPath);
  const outputUpload = await signedUpload(outputPath);
  const receiptUpload = await signedUpload(receiptPath);
  const job = {
    input: {
      contract: "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V2",
      capability: "ai.video.image_to_video",
      instruction: "A premium stabilized aerial push toward the dawn city skyline with a subtle controlled descent. Keep architecture, skyline geometry and perspective coherent with the supplied opening frame. Natural pre-sunrise light slowly develops, restrained realistic cloud movement, subtle water and traffic motion, physically plausible atmospheric depth, no artificial timelapse, no sudden camera movement, no morphing, no fantasy elements. The shot should feel like the opening of a world-class New York commercial film.",
      reference_images: [referenceUrl],
      reference_prepared: true,
      output_upload: outputUpload,
      duration_seconds: 5,
      fps: 24,
      seed: 4747,
      usage_id: `scene1-global-pod-${RUN_ID}`,
    },
  };
  const env = {
    HF_TOKEN,
    HUGGING_FACE_HUB_TOKEN: HF_TOKEN,
    AVANTIQO_VIDEO_LTX25_MODEL_ROOT: "/models/ltx-2.5",
    AVANTIQO_VIDEO_LTX25_PIPELINE_ROOT: "/opt/LTX-2",
    AVANTIQO_VIDEO_LTX25_HARD_TIMEOUT_SECONDS: "1800",
    AVANTIQO_VIDEO_LTX25_JOB_B64: Buffer.from(JSON.stringify(job)).toString("base64"),
    AVANTIQO_VIDEO_LTX25_RECEIPT_SIGNED_URL: receiptUpload.signed_url,
  };
  podId = await createPod(env);
  const receipt = await waitReceipt(receiptPath, podId);
  if (receipt?.success !== true) throw new Error(`${receipt?.error_code || "GLOBAL_POD_FAILED"}:${text(receipt?.error_detail)}`);
  const output = receipt.output || {};
  if (output.pipeline !== "TI2VID_ONE_STAGE_FULL_DEV_BF16") throw new Error("PIPELINE_INVALID");
  if (output.pixel_upscale_used !== false || output.learned_spatial_upscaler_used !== false || output.distilled_lora_used !== false || output.resize_used !== false || output.crop_used !== false) throw new Error("QUALITY_CONTRACT_BROKEN");
  if (output.preprocessing_inside_paid_worker !== false || output.ffprobe_inside_paid_worker !== false) throw new Error("PAID_WORKER_BOUNDARY_BROKEN");
  const size = await downloadStorage(outputPath, OUTPUT);
  const probe = probeOutput();
  const report = { success: true, pod_id: podId, endpoint_parked: true, pipeline: output.pipeline, foundation_model: output.foundation_model, foundation_revision: output.foundation_revision, width: output.width, height: output.height, fps: output.fps, frame_count: output.frame_count, seed: output.seed, model_download_seconds: output.model_download_seconds, generation_seconds: output.generation_seconds, output_size_bytes: size, storage_reference: output.storage_reference, post_gpu_probe: probe, pixel_upscale_used: output.pixel_upscale_used, learned_spatial_upscaler_used: output.learned_spatial_upscaler_used, distilled_lora_used: output.distilled_lora_used, preprocessing_inside_paid_worker: output.preprocessing_inside_paid_worker, ffprobe_inside_paid_worker: output.ffprobe_inside_paid_worker, production_deploy_performed: false };
  await fs.writeFile(REPORT, JSON.stringify(report, null, 2));
  console.log("AVANTIQO_VIDEO_GLOBAL_POD_SCENE1_NATIVE_MASTER=PASS");
  console.log(`AVANTIQO_VIDEO_GLOBAL_POD_OUTPUT_BYTES=${size}`);
} finally {
  if (podId) await deletePod(podId).catch(() => null);
  await removeStorage(inputPath).catch(() => null);
  console.log("AVANTIQO_VIDEO_GLOBAL_POD_CLEANUP_ATTEMPTED=true");
}
