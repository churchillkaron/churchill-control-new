import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";
import * as modal from "modal";

const CONTRACT = "AVANTIQO_INVESTOR_SINGLE_B200_SMOKE_V1";
const ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V2";
const STUDIO_LINEAGE_CONTRACT = "AVANTIQO_VIDEO_STUDIO_LINEAGE_V1";
const SHOT_BIBLE_CONTRACT = "CREATIVE_SHOT_BIBLE_V1";
const MODAL_APP = "avantiqo-video-owned";
const MODAL_FUNCTION = "generate_native_job";
const BUCKET = "creative-assets";
const ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const SOURCE_PATH = "33336a72-acb5-474e-856b-8be0269360e2/unassigned/eef84bd3-c208-4ed8-bba0-6088a9b67ef9-gemini-thgn4qnk6hof.mp4";
const WIDTH = 3840;
const MODEL_HEIGHT = 2176;
const MASTER_HEIGHT = 2160;
const FPS = 24;
const DURATION = 5;
const SEED = 240501;
const MAX_WAIT_SECONDS = Math.max(300, Number(process.env.AVANTIQO_VIDEO_SMOKE_MAX_WAIT_SECONDS || 1800));

const INSTRUCTION = "Prestige live-action investor-film shot in a real hospitality receiving area. Begin macro on delivered carton and packing evidence, then reveal a time-critical supplier short-shipment: a critical item is absent, an empty compartment is unmistakable, and the receiving manager recognizes the exception. The shot must be understandable visually before any product reveal. Natural practical light, authentic skin and materials, restrained cinematic camera movement, real depth, tactile cardboard and stainless steel, physically plausible motion. Native sound: trolley wheel, paper, refrigerator hum, one short pause before a restrained low score begins. No Avantiqo logo, no interface, no browser, no dashboard, no readable generated text, no neon, no hologram, no sci-fi network, no AI-art look.";

function text(value) { return String(value ?? "").trim(); }
let ACTIVE_MODAL_CLIENT = null;
let ACTIVE_FUNCTION_CALL_ID = "";
let ACTIVE_FUNCTION_CALL = null;
let ACTIVE_CANCEL_STARTED = false;

async function cancelActiveFunctionCall(reason) {
  if (!ACTIVE_MODAL_CLIENT || !ACTIVE_FUNCTION_CALL_ID || ACTIVE_CANCEL_STARTED) return;
  ACTIVE_CANCEL_STARTED = true;
  try {
    const call = ACTIVE_FUNCTION_CALL || await ACTIVE_MODAL_CLIENT.functionCalls.fromId(ACTIVE_FUNCTION_CALL_ID);
    await call.cancel({ terminateContainers: true });
    console.error(`AVANTIQO_VIDEO_SMOKE_FUNCTION_CALL_CANCELLED=${ACTIVE_FUNCTION_CALL_ID}:reason=${reason}`);
  } catch (error) {
    console.error(`AVANTIQO_VIDEO_SMOKE_FUNCTION_CALL_CANCEL_FAILED=${ACTIVE_FUNCTION_CALL_ID}:${text(error?.message)}`);
  } finally {
    ACTIVE_FUNCTION_CALL = null;
    ACTIVE_FUNCTION_CALL_ID = "";
  }
}

function approved(value) { return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase()); }
function ensure(condition, code) { if (!condition) throw new Error(`${CONTRACT}_${code}`); }
function requireEnv(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function storageRef(objectPath) { return `storage://${BUCKET}/${objectPath}`; }
function ffprobe(file) {
  return JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate,sample_rate,channels", "-of", "json", file], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }));
}

async function downloadBuffer(storage, objectPath) {
  const { data, error } = await storage.download(objectPath);
  if (error || !data) throw new Error(`${CONTRACT}_STORAGE_DOWNLOAD_FAILED:${objectPath}:${error?.message || "missing"}`);
  return Buffer.from(await data.arrayBuffer());
}

async function uploadBuffer(storage, objectPath, buffer, contentType, upsert = false) {
  const { error } = await storage.upload(objectPath, buffer, { contentType, upsert, cacheControl: "3600" });
  if (error) throw new Error(`${CONTRACT}_STORAGE_UPLOAD_FAILED:${objectPath}:${error.message}`);
}

async function signedUrl(storage, objectPath, expiresIn = 3600) {
  const { data, error } = await storage.createSignedUrl(objectPath, expiresIn);
  if (error || !data?.signedUrl) throw new Error(`${CONTRACT}_SIGNED_URL_FAILED:${objectPath}:${error?.message || "missing"}`);
  return data.signedUrl;
}

async function signedUploadUrl(storage, objectPath) {
  const { data, error } = await storage.createSignedUploadUrl(objectPath, { upsert: false });
  if (error || !data?.signedUrl) throw new Error(`${CONTRACT}_SIGNED_UPLOAD_FAILED:${objectPath}:${error?.message || "missing"}`);
  return data.signedUrl;
}

function extractReferenceFrame(sourceFile, targetFile, requestedTime = 1.0) {
  const probe = ffprobe(sourceFile);
  const duration = Number(probe.format?.duration || 0);
  ensure(Number.isFinite(duration) && duration > 0.25, "REFERENCE_SOURCE_DURATION_INVALID");
  const timestamp = Math.max(0.1, Math.min(requestedTime, duration - 0.1));
  execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", timestamp.toFixed(3), "-i", sourceFile, "-frames:v", "1", "-q:v", "1", targetFile]);
}

function normalizeShot(source, target) {
  const probe = ffprobe(source);
  const audioPresent = (probe.streams || []).some((stream) => stream.codec_type === "audio");
  const vf = `crop=${WIDTH}:${MASTER_HEIGHT}:0:8,setsar=1,fps=${FPS},format=yuv420p`;
  if (audioPresent) {
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", source, "-t", String(DURATION), "-vf", vf, "-af", "aresample=48000,aformat=channel_layouts=stereo", "-c:v", "libx264", "-preset", "fast", "-crf", "15", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", target]);
  } else {
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", source, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", String(DURATION), "-vf", vf, "-c:v", "libx264", "-preset", "fast", "-crf", "15", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", "-shortest", "-movflags", "+faststart", target]);
  }
}

async function main() {
  ensure(approved(process.env.AVANTIQO_VIDEO_SMOKE_REAL_INFERENCE_APPROVED), "REAL_INFERENCE_APPROVAL_REQUIRED");
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID);
  const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET);
  ensure(tokenId && tokenSecret, "MODAL_CREDENTIALS_REQUIRED");

  const runKey = text(process.env.AVANTIQO_VIDEO_SMOKE_RUN_KEY) || `single-b200-${text(process.env.GITHUB_SHA).slice(0, 12) || Date.now().toString(36)}`;
  const root = `${ORGANIZATION_ID}/investor-film-visual-proof-20260904/${runKey}`;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-investor-smoke-"));
  const auditDir = path.resolve("local-audit-output/avantiqo-investor-single-shot-smoke");
  await fs.mkdir(auditDir, { recursive: true });

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const storage = supabase.storage.from(BUCKET);

  const sourceBuffer = await downloadBuffer(storage, SOURCE_PATH);
  ensure(sourceBuffer.length > 100000, "SOURCE_TOO_SMALL");
  const sourceFile = path.join(temp, "source.mp4");
  const referenceFile = path.join(temp, "reference.jpg");
  await fs.writeFile(sourceFile, sourceBuffer);
  extractReferenceFrame(sourceFile, referenceFile, 1.0);
  const referenceBuffer = await fs.readFile(referenceFile);
  ensure(referenceBuffer.length > 15000, "REFERENCE_TOO_SMALL");

  const referencePath = `${root}/references/shot-1.jpg`;
  await uploadBuffer(storage, referencePath, referenceBuffer, "image/jpeg", false);
  const referenceUrl = await signedUrl(storage, referencePath, 7200);
  const outputPath = `${root}/generated/shot-1-physical-stake-3840x2176.mp4`;
  const uploadUrl = await signedUploadUrl(storage, outputPath);
  const shotId = `investor-smoke-${runKey}-physical-stake`;
  const shotBible = {
    contract: SHOT_BIBLE_CONTRACT,
    shot_id: shotId,
    organization_id: ORGANIZATION_ID,
    purpose: "physical-stake",
    story: { beat: "physical-stake", causal_thread: true },
    camera: { language: "premium physically plausible cinematic movement" },
    lighting: { intent: "real premium practical light, restrained warm-gold continuity" },
    negative_constraints: ["screenshots", "browser capture", "static dashboard", "neon HUD", "holograms", "readable generated text", "AI-art look"],
    output: { duration_seconds: DURATION, frame_rate: FPS, resolution: `${WIDTH}x${MODEL_HEIGHT}`, aspect_ratio: "16:9" },
    generation_instruction: INSTRUCTION,
  };

  const payload = {
    contract: ENGINE_CONTRACT,
    capability: "ai.video.image_to_video",
    model: "avantiqo-ltx-2.5",
    instruction: INSTRUCTION,
    organization_id: ORGANIZATION_ID,
    usage_id: `investor-smoke-${runKey}`,
    source_urls: [referenceUrl],
    source_assets: [referenceUrl],
    structured_specification: {
      generation: { duration_seconds: DURATION, fps: FPS, resolution: `${WIDTH}x${MODEL_HEIGHT}`, aspect_ratio: "16:9", seed: SEED },
      output_spec: { duration_seconds: DURATION, fps: FPS, resolution: `${WIDTH}x${MODEL_HEIGHT}`, aspect_ratio: "16:9" },
      metadata: { studio_lineage: { contract: STUDIO_LINEAGE_CONTRACT, shot_id: shotId, shot_bible: shotBible }, investor_visual_proof_contract: CONTRACT, creative_lock_version: "AVANTIQO_INVESTOR_FILM_CREATIVE_LOCK_V1" },
    },
    storage_upload: { signed_url: uploadUrl, storage_reference: storageRef(outputPath) },
  };

  const client = new modal.ModalClient({ tokenId, tokenSecret });
  ACTIVE_MODAL_CLIENT = client;
  const lookupOptions = text(process.env.MODAL_ENVIRONMENT) ? { environment: text(process.env.MODAL_ENVIRONMENT) } : {};
  const worker = await client.functions.fromName(MODAL_APP, MODAL_FUNCTION, lookupOptions);
  const stats = await worker.getCurrentStats();
  ensure(Number(stats?.backlog || 0) === 0, `TRANSPORT_BACKLOG_NOT_ZERO:${stats?.backlog}`);
  console.log(JSON.stringify({ event: "AVANTIQO_INVESTOR_SINGLE_B200_SMOKE_SPAWN", gpu_jobs: 1, duration_seconds: DURATION, automatic_paid_retry: false }));
  const call = await worker.spawn([payload]);
  const functionCallId = text(call.functionCallId);
  ensure(functionCallId, "FUNCTION_CALL_ID_REQUIRED");
  ACTIVE_FUNCTION_CALL = call;
  ACTIVE_FUNCTION_CALL_ID = functionCallId;
  ACTIVE_CANCEL_STARTED = false;
  console.log(`AVANTIQO_VIDEO_SMOKE_FUNCTION_CALL_ID=${functionCallId}`);

  const deadline = Date.now() + MAX_WAIT_SECONDS * 1000;
  let polls = 0;
  let result;
  for (;;) {
    polls += 1;
    if (Date.now() >= deadline) {
      await cancelActiveFunctionCall(`generation-deadline-${MAX_WAIT_SECONDS}s`);
      throw new Error(`${CONTRACT}_GENERATION_DEADLINE_EXCEEDED:${MAX_WAIT_SECONDS}s`);
    }
    const sameCall = await client.functionCalls.fromId(functionCallId);
    try {
      result = await sameCall.get({ timeoutMs: 0 });
      ACTIVE_FUNCTION_CALL = null;
      ACTIVE_FUNCTION_CALL_ID = "";
      break;
    } catch (error) {
      if (error instanceof modal.FunctionTimeoutError && /Timeout exceeded:\s*0ms/i.test(text(error?.message))) {
        if (polls % 6 === 0) console.log(`AVANTIQO_VIDEO_SMOKE_PENDING=${polls}`);
        await sleep(10000);
        continue;
      }
      throw error;
    }
  }

  ensure(result?.success === true, "GENERATION_FAILED");
  ensure(result?.gpu_generation_calls === 1, `GPU_CALL_COUNT_INVALID:${result?.gpu_generation_calls}`);
  ensure(Number(result?.width) === WIDTH && Number(result?.height) === MODEL_HEIGHT, `MODEL_DIMENSIONS_INVALID:${result?.width}x${result?.height}`);
  ensure(result?.automatic_paid_retry === false, "AUTOMATIC_PAID_RETRY_INVALID");

  const generatedBuffer = await downloadBuffer(storage, outputPath);
  ensure(generatedBuffer.length > 1000000, `GENERATED_OUTPUT_TOO_SMALL:${generatedBuffer.length}`);
  const rawFile = path.join(temp, "generated.mp4");
  const deliveryFile = path.join(auditDir, "avantiqo-investor-smoke-5s-4k.mp4");
  await fs.writeFile(rawFile, generatedBuffer);
  normalizeShot(rawFile, deliveryFile);
  const deliveryProbe = ffprobe(deliveryFile);
  const video = (deliveryProbe.streams || []).find((stream) => stream.codec_type === "video");
  const audio = (deliveryProbe.streams || []).find((stream) => stream.codec_type === "audio");
  const actualDuration = Number(deliveryProbe.format?.duration || 0);
  ensure(Number(video?.width) === WIDTH && Number(video?.height) === MASTER_HEIGHT, "DELIVERY_DIMENSIONS_INVALID");
  ensure(audio, "DELIVERY_AUDIO_REQUIRED");
  ensure(Math.abs(actualDuration - DURATION) <= 0.08, `DELIVERY_DURATION_INVALID:${actualDuration}`);

  const deliveryBuffer = await fs.readFile(deliveryFile);
  const deliveryPath = `${root}/master/avantiqo-investor-smoke-5s-4k.mp4`;
  await uploadBuffer(storage, deliveryPath, deliveryBuffer, "video/mp4", false);
  const deliverySignedUrl = await signedUrl(storage, deliveryPath, 60 * 60 * 24 * 7);

  const report = {
    success: true,
    contract: CONTRACT,
    run_key: runKey,
    modal_function_call_id: functionCallId,
    modal_poll_count: polls,
    gpu_generation_calls: 1,
    automatic_paid_retry: false,
    duration_seconds: actualDuration,
    native_resolution: `${WIDTH}x${MODEL_HEIGHT}`,
    delivery_resolution: `${WIDTH}x${MASTER_HEIGHT}`,
    source_path: SOURCE_PATH,
    generated_storage_reference: storageRef(outputPath),
    delivery: { storage_reference: storageRef(deliveryPath), signed_url: deliverySignedUrl, bytes: deliveryBuffer.length, local_path: deliveryFile },
    generation_result: result,
  };
  await fs.writeFile(path.join(auditDir, "avantiqo-investor-smoke-report.json"), JSON.stringify(report, null, 2));
  console.log(`${CONTRACT}=PASS`);
  console.log(`AVANTIQO_VIDEO_SMOKE_SIGNED_URL=${deliverySignedUrl}`);
  console.log(`AVANTIQO_VIDEO_SMOKE_STORAGE_REFERENCE=${storageRef(deliveryPath)}`);
}

main().catch(async (error) => {
  await cancelActiveFunctionCall("runner-error");
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
