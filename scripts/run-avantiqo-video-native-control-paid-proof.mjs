import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";
import * as modal from "modal";
import { applyCreativeVideoNativeControls } from "../lib/creative/video/runtime/CreativeVideoNativeControlRuntime.js";

const CONTRACT = "AVANTIQO_VIDEO_NATIVE_CONTROL_PAID_PROOF_V1";
const ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V2";
const WORKER_CONTROL_CONTRACT = "AVANTIQO_VIDEO_LTX25_NATIVE_CONTROLLED_MASTER_V1";
const SHOT_BIBLE_CONTRACT = "CREATIVE_SHOT_BIBLE_V1";
const STUDIO_LINEAGE_CONTRACT = "AVANTIQO_VIDEO_STUDIO_LINEAGE_V1";
const MODAL_APP = "avantiqo-video-owned";
const MODAL_FUNCTION = "generate_native_job";
const BUCKET = "creative-assets";
const SOURCE_BYTES = 1255816;
const WIDTH = 3840;
const HEIGHT = 2176;
const FPS = 24;
const DURATION_SECONDS = 5;
const SEED = 9137;
const SAMPLE_FPS = 6;
const SAMPLE_WIDTH = 160;
const SAMPLE_HEIGHT = 90;
const FRAME_BYTES = SAMPLE_WIDTH * SAMPLE_HEIGHT;
const AUDIO_DURATION_TOLERANCE = 0.12;
const AUDIO_START_TOLERANCE = 0.08;

function text(value) { return String(value ?? "").trim(); }
function requireEnv(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function approved(value) { return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase()); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function storageRef(objectPath) { return `storage://${BUCKET}/${objectPath}`; }
function storagePath(value) {
  const prefix = `storage://${BUCKET}/`;
  const raw = text(value);
  if (!raw.startsWith(prefix)) throw new Error(`${CONTRACT}_STORAGE_REFERENCE_INVALID`);
  return raw.slice(prefix.length);
}
function sha256(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
function ensure(condition, code) { if (!condition) throw new Error(`${CONTRACT}_${code}`); }
function ratio(value) {
  const [a, b] = text(value).split("/").map(Number);
  if (!Number.isFinite(a)) return null;
  return !Number.isFinite(b) || b === 0 ? a : a / b;
}
function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1))];
}
function frameMean(frame) { let sum = 0; for (const value of frame) sum += value; return sum / frame.length; }
function frameDiff(a, b) { let sum = 0; for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]); return (sum / a.length / 255) * 100; }

async function uploadBuffer(storage, objectPath, buffer, contentType, upsert = true) {
  const { error } = await storage.upload(objectPath, buffer, { contentType, upsert, cacheControl: "3600" });
  if (error) throw new Error(`${CONTRACT}_STORAGE_UPLOAD_FAILED:${objectPath}:${error.message}`);
}
async function signedUrl(storage, objectPath, expiresIn = 3600) {
  const { data, error } = await storage.createSignedUrl(objectPath, expiresIn);
  if (error || !data?.signedUrl) throw new Error(`${CONTRACT}_SIGNED_URL_FAILED:${objectPath}:${error?.message || "missing"}`);
  return data.signedUrl;
}
async function downloadBuffer(storage, objectPath) {
  const { data, error } = await storage.download(objectPath);
  if (error || !data) throw new Error(`${CONTRACT}_STORAGE_DOWNLOAD_FAILED:${objectPath}:${error?.message || "missing"}`);
  return Buffer.from(await data.arrayBuffer());
}

function ffprobe(filePath) {
  const raw = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration,start_time,size,bit_rate:stream=index,codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate,duration,start_time,sample_rate,channels", "-of", "json", filePath], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(raw);
}
function extractFrame(source, target, timestamp) {
  execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", timestamp.toFixed(3), "-i", source, "-frames:v", "1", "-q:v", "1", target], { stdio: "pipe" });
}
function temporalEvidence(filePath, audioRequired = true) {
  const probe = ffprobe(filePath);
  const streams = Array.isArray(probe.streams) ? probe.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");
  ensure(video, "VIDEO_STREAM_REQUIRED");
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", filePath, "-map", "0:v:0", "-an", "-vf", `fps=${SAMPLE_FPS},scale=${SAMPLE_WIDTH}:${SAMPLE_HEIGHT}:force_original_aspect_ratio=decrease,pad=${SAMPLE_WIDTH}:${SAMPLE_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,format=gray`, "-frames:v", "180", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"], { encoding: null, maxBuffer: FRAME_BYTES * 180 + 1024 * 1024 });
  const frameCount = Math.floor(raw.length / FRAME_BYTES);
  ensure(frameCount >= 2, `TEMPORAL_SAMPLE_INSUFFICIENT:${frameCount}`);
  const frames = Array.from({ length: frameCount }, (_, index) => raw.subarray(index * FRAME_BYTES, (index + 1) * FRAME_BYTES));
  const means = frames.map(frameMean);
  const motion = [];
  const luma = [];
  for (let i = 1; i < frames.length; i += 1) {
    motion.push(frameDiff(frames[i - 1], frames[i]));
    luma.push((Math.abs(means[i] - means[i - 1]) / 255) * 100);
  }
  const jerk = motion.slice(1).map((value, index) => Math.abs(value - motion[index]));
  const formatDuration = Number(probe.format?.duration);
  const videoDuration = Number(video.duration || formatDuration);
  const audioDuration = audio ? Number(audio.duration || formatDuration) : null;
  const videoStart = Number(video.start_time || probe.format?.start_time || 0);
  const audioStart = audio ? Number(audio.start_time || probe.format?.start_time || 0) : null;
  const durationDelta = audio ? Math.abs(videoDuration - audioDuration) : null;
  const startDelta = audio ? Math.abs(videoStart - audioStart) : null;
  const timingPassed = !audioRequired || Boolean(audio && durationDelta <= AUDIO_DURATION_TOLERANCE && startDelta <= AUDIO_START_TOLERANCE);
  const evidence = {
    contract: "CREATIVE_VIDEO_TEMPORAL_EVIDENCE_V1",
    evidence_ready: true,
    provider_calls_executed: 0,
    gpu_calls_executed: 0,
    sample: {
      sampled_fps: SAMPLE_FPS,
      sampled_frame_count: frameCount,
      motion_change_percent: { median: percentile(motion, 0.5), p95: percentile(motion, 0.95), maximum: Math.max(...motion), first_to_last: frameDiff(frames[0], frames.at(-1)) },
      motion_smoothness_proxy: { jerk_median: percentile(jerk, 0.5), jerk_p95: percentile(jerk, 0.95), jerk_maximum: jerk.length ? Math.max(...jerk) : 0 },
      temporal_flicker_proxy: { luma_delta_median: percentile(luma, 0.5), luma_delta_p95: percentile(luma, 0.95), luma_delta_maximum: Math.max(...luma) },
      dynamic_degree_proxy: motion.filter((value) => value >= 1).length / motion.length,
      near_duplicate_pair_ratio: motion.filter((value) => value <= 0.12).length / motion.length,
    },
    audio_video_timing: { audio_required: audioRequired, audio_present: Boolean(audio), video_duration_seconds: videoDuration, audio_duration_seconds: audioDuration, duration_delta_seconds: durationDelta, duration_tolerance_seconds: AUDIO_DURATION_TOLERANCE, video_start_seconds: videoStart, audio_start_seconds: audioStart, start_delta_seconds: startDelta, start_tolerance_seconds: AUDIO_START_TOLERANCE, passed: timingPassed },
    risk_flags: [],
    hard_failures: timingPassed ? [] : ["AUDIO_VIDEO_TIMING_MISMATCH"],
  };
  if (evidence.sample.near_duplicate_pair_ratio >= 0.9 && evidence.sample.motion_change_percent.p95 <= 0.5) evidence.risk_flags.push("NEAR_STATIC_OR_FROZEN_SEQUENCE");
  if (evidence.sample.motion_smoothness_proxy.jerk_p95 >= 8 && evidence.sample.motion_change_percent.median <= 3) evidence.risk_flags.push("TEMPORAL_MOTION_JERK_RISK");
  if (evidence.sample.temporal_flicker_proxy.luma_delta_p95 >= 10) evidence.risk_flags.push("LUMA_FLICKER_OR_FLASH_RISK");
  if (!timingPassed) evidence.risk_flags.push("AUDIO_VIDEO_TIMING_MISMATCH");
  return { probe, evidence };
}

async function main() {
  ensure(approved(process.env.AVANTIQO_VIDEO_NATIVE_CONTROL_REAL_INFERENCE_APPROVED), "REAL_INFERENCE_APPROVAL_REQUIRED");
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID);
  const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET);
  ensure(tokenId && tokenSecret, "MODAL_CREDENTIALS_REQUIRED");
  const organizationId = requireEnv("AVANTIQO_VIDEO_PROOF_ORGANIZATION_ID");
  const sourcePath = requireEnv("AVANTIQO_VIDEO_PROOF_SOURCE_PATH");
  const proofKey = text(process.env.AVANTIQO_VIDEO_NATIVE_CONTROL_PROOF_KEY) || "native-control-v1";
  const shotId = `video-native-control-proof-${proofKey}`;
  const usageId = `video-native-control-proof-${proofKey}`;
  const root = `${organizationId}/certification/video-native-control/${proofKey}`;
  const lockPath = `${root}/paid-proof-lock.json`;
  const openingPath = `${root}/opening.jpg`;
  const closingPath = `${root}/closing.jpg`;
  const outputPath = `${root}/native-master-3840x2176.mp4`;

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const storage = supabase.storage.from(BUCKET);
  const sourceBuffer = await downloadBuffer(storage, sourcePath);
  ensure(sourceBuffer.length === SOURCE_BYTES, `CANONICAL_SOURCE_SIZE_INVALID:${sourceBuffer.length}`);

  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-video-control-proof-"));
  const sourceFile = path.join(temp, "source.mp4");
  const openingFile = path.join(temp, "opening.jpg");
  const closingFile = path.join(temp, "closing.jpg");
  await fs.writeFile(sourceFile, sourceBuffer);
  const sourceProbe = ffprobe(sourceFile);
  const duration = Number(sourceProbe.format?.duration || 0);
  ensure(Number.isFinite(duration) && duration > 1, "CANONICAL_SOURCE_DURATION_INVALID");
  extractFrame(sourceFile, openingFile, Math.min(0.25, duration / 4));
  extractFrame(sourceFile, closingFile, Math.max(0.25, duration - 0.25));
  const openingBuffer = await fs.readFile(openingFile);
  const closingBuffer = await fs.readFile(closingFile);
  ensure(openingBuffer.length > 20000 && closingBuffer.length > 20000, "REFERENCE_FRAME_INVALID");
  await uploadBuffer(storage, openingPath, openingBuffer, "image/jpeg", true);
  await uploadBuffer(storage, closingPath, closingBuffer, "image/jpeg", true);

  const openingRef = { storage_reference: storageRef(openingPath) };
  const closingRef = { storage_reference: storageRef(closingPath) };
  const shotBible = {
    contract: SHOT_BIBLE_CONTRACT,
    shot_id: shotId,
    organization_id: organizationId,
    story: { purpose: "founder continuity proof", beat: "credible premium founder portrait" },
    identity: { requirements: ["preserve founder face, age, hair, wardrobe and natural skin texture"] },
    environment: { continuity: ["preserve room geometry, lens perspective and practical lighting"] },
    camera: { movement: "slow stabilized push-in", framing: "premium cinematic portrait", continuity: "no camera jumps" },
    lighting: { intent: "natural premium practical ambience, realistic skin tones" },
    frame_plan: { opening_frame: openingRef, closing_frame: closingRef },
    audio: { sound_effects: ["subtle synchronized room tone and natural ambience"] },
    output: { duration_seconds: DURATION_SECONDS, frame_rate: FPS, resolution: `${WIDTH}x${HEIGHT}`, aspect_ratio: "16:9" },
  };
  const controlled = applyCreativeVideoNativeControls({
    capability: "ai.video.first_last_frame_to_video",
    shot_id: shotId,
    shot_bible: shotBible,
    first_frame: openingRef,
    last_frame: closingRef,
    prompt: "Create a restrained world-class commercial portrait continuation. Preserve the founder and room exactly between the supplied first and last frames. Use physically plausible subtle human motion, a slow stabilized push-in, natural facial micro-movement, premium realistic lighting and synchronized understated ambience. No morphing, duplicated features, warped hands, geometry drift, sudden camera movement, artificial beauty filtering, text or logos.",
    generation: { duration_seconds: DURATION_SECONDS, fps: FPS, resolution: `${WIDTH}x${HEIGHT}`, aspect_ratio: "16:9", seed: SEED },
    metadata: { certification_contract: CONTRACT },
  });
  const conditions = controlled.metadata?.creative_video_native_control?.reference_conditions || [];
  ensure(conditions.length === 2, `REFERENCE_CONDITION_COUNT_INVALID:${conditions.length}`);
  ensure(conditions[0]?.role === "OPENING_FRAME" && conditions[1]?.role === "CLOSING_FRAME", "REFERENCE_CONDITION_ROLES_INVALID");

  const sourceUrls = [];
  for (const asset of controlled.source_assets || []) sourceUrls.push(await signedUrl(storage, storagePath(asset.storage_reference)));
  ensure(sourceUrls.length === 2, "SIGNED_REFERENCE_COUNT_INVALID");
  const { data: uploadData, error: uploadError } = await storage.createSignedUploadUrl(outputPath, { upsert: false });
  if (uploadError || !uploadData?.signedUrl) throw new Error(`${CONTRACT}_OUTPUT_SIGNED_UPLOAD_FAILED:${uploadError?.message || "missing"}`);

  const metadata = {
    ...controlled.metadata,
    studio_lineage: { contract: STUDIO_LINEAGE_CONTRACT, shot_id: shotId, shot_bible: shotBible },
  };
  const payload = {
    contract: ENGINE_CONTRACT,
    capability: controlled.capability,
    model: "avantiqo-ltx-2.5",
    instruction: controlled.prompt,
    structured_specification: {
      generation: controlled.generation,
      requirements: controlled.requirements,
      intent: controlled.intent,
      output_spec: controlled.output_spec,
      provider_parameters: controlled.provider_parameters,
      identity_lock: controlled.identity_lock,
      repair_contract: controlled.repair_contract,
      repair_specification: controlled.repair_specification,
      metadata,
    },
    source_asset_roles: { source_image: sourceUrls[0] },
    source_assets: sourceUrls,
    organization_id: organizationId,
    usage_id: usageId,
    storage_upload: { signed_url: uploadData.signedUrl, storage_reference: storageRef(outputPath) },
  };

  const client = new modal.ModalClient({ tokenId, tokenSecret });
  const lookupOptions = text(process.env.MODAL_ENVIRONMENT) ? { environment: text(process.env.MODAL_ENVIRONMENT) } : {};
  const worker = await client.functions.fromName(MODAL_APP, MODAL_FUNCTION, lookupOptions);

  const lockClaim = { contract: CONTRACT, status: "CLAIMED", proof_key: proofKey, source_sha256: sha256(sourceBuffer), opening_sha256: sha256(openingBuffer), closing_sha256: sha256(closingBuffer), claimed_at: new Date().toISOString(), github_sha: text(process.env.GITHUB_SHA) || null };
  const { error: lockError } = await storage.upload(lockPath, Buffer.from(JSON.stringify(lockClaim, null, 2)), { contentType: "application/json", upsert: false, cacheControl: "3600" });
  if (lockError) throw new Error(`${CONTRACT}_PAID_PROOF_LOCK_EXISTS_OR_FAILED:${lockError.message}`);

  console.log(JSON.stringify({ event: "AVANTIQO_VIDEO_NATIVE_CONTROL_PAID_SPAWN", maximum_paid_gpu_jobs: 1, automatic_paid_retry: false, modal_app: MODAL_APP, modal_function: MODAL_FUNCTION, reference_condition_count: conditions.length, proof_key: proofKey }));
  const call = await worker.spawn([payload]);
  const functionCallId = text(call.functionCallId);
  ensure(functionCallId, "MODAL_FUNCTION_CALL_ID_REQUIRED");
  await storage.update(lockPath, Buffer.from(JSON.stringify({ ...lockClaim, status: "SPAWNED", function_call_id: functionCallId, spawned_at: new Date().toISOString() }, null, 2)), { contentType: "application/json", cacheControl: "3600" });
  console.log(`AVANTIQO_VIDEO_MODAL_FUNCTION_CALL_ID=${functionCallId}`);
  console.log("AVANTIQO_VIDEO_MODAL_SPAWN_COUNT=1");

  let result;
  let polls = 0;
  for (;;) {
    polls += 1;
    const sameCall = await client.functionCalls.fromId(functionCallId);
    try {
      result = await sameCall.get({ timeoutMs: 0 });
      break;
    } catch (error) {
      if (error instanceof modal.FunctionTimeoutError && /Timeout exceeded:\s*0ms/i.test(text(error?.message))) {
        console.log(`AVANTIQO_VIDEO_MODAL_POLL_PENDING=${polls}`);
        await sleep(10000);
        continue;
      }
      throw error;
    }
  }

  ensure(result?.success === true, "MODAL_RESULT_FAILED");
  ensure(result?.gpu_generation_calls === 1, `GPU_GENERATION_CALLS_INVALID:${result?.gpu_generation_calls}`);
  ensure(result?.native_control_executed === true, "NATIVE_CONTROL_NOT_EXECUTED");
  ensure(result?.control_contract === WORKER_CONTROL_CONTRACT, `CONTROL_CONTRACT_INVALID:${result?.control_contract}`);
  ensure(result?.first_frame_conditioning_used === true, "FIRST_FRAME_CONTROL_NOT_USED");
  ensure(result?.last_frame_conditioning_used === true, "LAST_FRAME_CONTROL_NOT_USED");
  ensure(result?.reference_condition_count === 2, `WORKER_REFERENCE_COUNT_INVALID:${result?.reference_condition_count}`);
  ensure(Array.isArray(result?.reference_condition_roles) && result.reference_condition_roles.join(",") === "OPENING_FRAME,CLOSING_FRAME", "WORKER_REFERENCE_ROLES_INVALID");
  ensure(result?.modal_gpu === "B200", `GPU_INVALID:${result?.modal_gpu}`);
  ensure(result?.width === WIDTH && result?.height === HEIGHT && result?.fps === FPS && result?.num_inference_steps === 30, "NATIVE_MASTER_SPEC_INVALID");
  ensure(result?.master_is_exact_model_output === true && result?.native_master_generated === true, "NATIVE_MASTER_PROVENANCE_INVALID");
  for (const key of ["pixel_upscale_used", "learned_latent_upsampler_used", "learned_spatial_upscaler_used", "temporal_interpolation_used", "resize_used", "crop_used", "grading_used", "assembly_used", "delivery_transform_used", "automatic_paid_retry", "runpod_inference_performed", "external_provider_contacted"]) ensure(result?.[key] === false, `PROVENANCE_FLAG_INVALID:${key}:${result?.[key]}`);
  ensure(result?.studio_lineage_validated === true && result?.shot_id === shotId, "STUDIO_LINEAGE_NOT_VALIDATED");

  const outputBuffer = await downloadBuffer(storage, outputPath);
  ensure(outputBuffer.length > 1000000, `OUTPUT_TOO_SMALL:${outputBuffer.length}`);
  const auditDir = path.resolve("local-audit-output/avantiqo-video-native-control-paid-proof");
  await fs.mkdir(auditDir, { recursive: true });
  const outputFile = path.join(auditDir, "native-control-master-3840x2176.mp4");
  await fs.writeFile(outputFile, outputBuffer);
  const { probe, evidence } = temporalEvidence(outputFile, true);
  const video = (probe.streams || []).find((stream) => stream.codec_type === "video");
  const audio = (probe.streams || []).find((stream) => stream.codec_type === "audio");
  ensure(Number(video?.width) === WIDTH && Number(video?.height) === HEIGHT, "FFPROBE_DIMENSIONS_INVALID");
  ensure(Math.abs((ratio(video?.avg_frame_rate || video?.r_frame_rate) || 0) - FPS) < 0.01, "FFPROBE_FPS_INVALID");
  ensure(Boolean(audio), "NATIVE_AUDIO_STREAM_REQUIRED");
  ensure(evidence.audio_video_timing.passed === true, "AUDIO_VIDEO_TIMING_FAILED");

  const report = {
    success: true,
    contract: CONTRACT,
    proof_key: proofKey,
    modal_function_call_id: functionCallId,
    modal_spawn_count: 1,
    modal_poll_count: polls,
    maximum_paid_gpu_jobs: 1,
    automatic_paid_retry: false,
    source: { path: sourcePath, bytes: sourceBuffer.length, sha256: sha256(sourceBuffer) },
    references: { opening: { path: openingPath, bytes: openingBuffer.length, sha256: sha256(openingBuffer) }, closing: { path: closingPath, bytes: closingBuffer.length, sha256: sha256(closingBuffer) } },
    shot_bible: shotBible,
    native_control: controlled.metadata.creative_video_native_control,
    generation_result: result,
    output: { storage_reference: storageRef(outputPath), bytes: outputBuffer.length, sha256: sha256(outputBuffer), local_path: outputFile },
    technical: { width: Number(video.width), height: Number(video.height), fps: ratio(video.avg_frame_rate || video.r_frame_rate), audio_present: Boolean(audio), exact_model_output: true },
    temporal_evidence: evidence,
    production_vercel_deploy_performed: false,
    pricing_activation_performed: false,
    provider_routing_activation_performed: false,
    customer_wallet_mutation_performed: false,
  };
  await fs.writeFile(path.join(auditDir, "native-control-paid-proof.json"), JSON.stringify(report, null, 2));
  await storage.update(lockPath, Buffer.from(JSON.stringify({ ...lockClaim, status: "COMPLETED", function_call_id: functionCallId, completed_at: new Date().toISOString(), output_storage_reference: storageRef(outputPath), output_sha256: report.output.sha256 }, null, 2)), { contentType: "application/json", cacheControl: "3600" });
  console.log(`${CONTRACT}=PASS`);
  console.log("AVANTIQO_VIDEO_GPU_GENERATION_CALLS=1");
  console.log("AVANTIQO_VIDEO_AUTOMATIC_PAID_RETRY=false");
  console.log(`AVANTIQO_VIDEO_OUTPUT_SHA256=${report.output.sha256}`);
  console.log(`AVANTIQO_VIDEO_TEMPORAL_RISK_FLAGS=${evidence.risk_flags.join(",") || "NONE"}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
