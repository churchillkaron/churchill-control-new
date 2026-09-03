import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import * as modal from "modal";

const CONTRACT = "AVANTIQO_VIDEO_NATIVE_CONTROL_PAID_PROOF_RECOVERY_V1";
const ORIGINAL_CONTRACT = "AVANTIQO_VIDEO_NATIVE_CONTROL_PAID_PROOF_V1";
const CONTROL_CONTRACT = "AVANTIQO_VIDEO_LTX25_NATIVE_CONTROLLED_MASTER_V1";
const BUCKET = "creative-assets";
const WIDTH = 3840;
const HEIGHT = 2176;
const FPS = 24;
const SAMPLE_FPS = 6;
const SAMPLE_WIDTH = 160;
const SAMPLE_HEIGHT = 90;
const FRAME_BYTES = SAMPLE_WIDTH * SAMPLE_HEIGHT;
const AUDIO_DURATION_TOLERANCE = 0.12;
const AUDIO_START_TOLERANCE = 0.08;
const MAX_POLLS = 120;
const POLL_MS = 5000;

function text(value) { return String(value ?? "").trim(); }
function requireEnv(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function ensure(condition, code) { if (!condition) throw new Error(`${CONTRACT}_${code}`); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sha256(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
function ratio(value) {
  const [left, right] = text(value).split("/").map(Number);
  if (!Number.isFinite(left)) return null;
  if (!Number.isFinite(right) || right === 0) return left;
  return left / right;
}
function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1))];
}
function frameMean(frame) { let sum = 0; for (const value of frame) sum += value; return sum / frame.length; }
function frameDiff(left, right) {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += Math.abs(left[index] - right[index]);
  return (sum / left.length / 255) * 100;
}

async function downloadBuffer(storage, objectPath) {
  const { data, error } = await storage.download(objectPath);
  if (error || !data) throw new Error(`${CONTRACT}_STORAGE_DOWNLOAD_FAILED:${objectPath}:${error?.message || "missing"}`);
  return Buffer.from(await data.arrayBuffer());
}

function ffprobe(filePath) {
  const raw = execFileSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,start_time,size,bit_rate:stream=index,codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate,duration,start_time,sample_rate,channels",
    "-of", "json",
    filePath,
  ], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(raw);
}

function temporalEvidence(filePath) {
  const probe = ffprobe(filePath);
  const streams = Array.isArray(probe.streams) ? probe.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");
  ensure(video, "VIDEO_STREAM_REQUIRED");
  ensure(audio, "NATIVE_AUDIO_STREAM_REQUIRED");

  const raw = execFileSync("ffmpeg", [
    "-v", "error", "-i", filePath,
    "-map", "0:v:0", "-an",
    "-vf", `fps=${SAMPLE_FPS},scale=${SAMPLE_WIDTH}:${SAMPLE_HEIGHT}:force_original_aspect_ratio=decrease,pad=${SAMPLE_WIDTH}:${SAMPLE_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,format=gray`,
    "-frames:v", "180",
    "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1",
  ], { encoding: null, maxBuffer: FRAME_BYTES * 180 + 1024 * 1024 });
  const frameCount = Math.floor(raw.length / FRAME_BYTES);
  ensure(frameCount >= 2, `TEMPORAL_SAMPLE_INSUFFICIENT:${frameCount}`);
  const frames = Array.from({ length: frameCount }, (_, index) => raw.subarray(index * FRAME_BYTES, (index + 1) * FRAME_BYTES));
  const means = frames.map(frameMean);
  const motion = [];
  const luma = [];
  for (let index = 1; index < frames.length; index += 1) {
    motion.push(frameDiff(frames[index - 1], frames[index]));
    luma.push((Math.abs(means[index] - means[index - 1]) / 255) * 100);
  }
  const jerk = motion.slice(1).map((value, index) => Math.abs(value - motion[index]));
  const formatDuration = Number(probe.format?.duration);
  const videoDuration = Number(video.duration || formatDuration);
  const audioDuration = Number(audio.duration || formatDuration);
  const videoStart = Number(video.start_time || probe.format?.start_time || 0);
  const audioStart = Number(audio.start_time || probe.format?.start_time || 0);
  const durationDelta = Math.abs(videoDuration - audioDuration);
  const startDelta = Math.abs(videoStart - audioStart);
  const timingPassed = durationDelta <= AUDIO_DURATION_TOLERANCE && startDelta <= AUDIO_START_TOLERANCE;
  const nearDuplicateRatio = motion.filter((value) => value <= 0.12).length / motion.length;
  const motionMedian = percentile(motion, 0.5);
  const motionP95 = percentile(motion, 0.95);
  const jerkP95 = percentile(jerk, 0.95);
  const lumaP95 = percentile(luma, 0.95);
  const riskFlags = [];
  if (nearDuplicateRatio >= 0.9 && motionP95 <= 0.5) riskFlags.push("NEAR_STATIC_OR_FROZEN_SEQUENCE");
  if (jerkP95 >= 8 && motionMedian <= 3) riskFlags.push("TEMPORAL_MOTION_JERK_RISK");
  if (lumaP95 >= 10) riskFlags.push("LUMA_FLICKER_OR_FLASH_RISK");
  if (!timingPassed) riskFlags.push("AUDIO_VIDEO_TIMING_MISMATCH");

  return {
    probe,
    evidence: {
      contract: "CREATIVE_VIDEO_TEMPORAL_EVIDENCE_V1",
      evidence_ready: true,
      provider_calls_executed: 0,
      gpu_calls_executed: 0,
      sample: {
        sampled_fps: SAMPLE_FPS,
        sampled_frame_count: frameCount,
        motion_change_percent: { median: motionMedian, p95: motionP95, maximum: Math.max(...motion), first_to_last: frameDiff(frames[0], frames.at(-1)) },
        motion_smoothness_proxy: { jerk_median: percentile(jerk, 0.5), jerk_p95: jerkP95, jerk_maximum: jerk.length ? Math.max(...jerk) : 0 },
        temporal_flicker_proxy: { luma_delta_median: percentile(luma, 0.5), luma_delta_p95: lumaP95, luma_delta_maximum: Math.max(...luma) },
        dynamic_degree_proxy: motion.filter((value) => value >= 1).length / motion.length,
        near_duplicate_pair_ratio: nearDuplicateRatio,
      },
      audio_video_timing: {
        audio_required: true,
        audio_present: true,
        video_duration_seconds: videoDuration,
        audio_duration_seconds: audioDuration,
        duration_delta_seconds: durationDelta,
        duration_tolerance_seconds: AUDIO_DURATION_TOLERANCE,
        video_start_seconds: videoStart,
        audio_start_seconds: audioStart,
        start_delta_seconds: startDelta,
        start_tolerance_seconds: AUDIO_START_TOLERANCE,
        passed: timingPassed,
      },
      risk_flags: riskFlags,
      hard_failures: timingPassed ? [] : ["AUDIO_VIDEO_TIMING_MISMATCH"],
    },
  };
}

function validateGeneration(result, expectedShotId) {
  ensure(result?.success === true, "MODAL_RESULT_FAILED");
  ensure(result?.gpu_generation_calls === 1, `GPU_GENERATION_CALLS_INVALID:${result?.gpu_generation_calls}`);
  ensure(result?.native_control_executed === true, "NATIVE_CONTROL_NOT_EXECUTED");
  ensure(result?.control_contract === CONTROL_CONTRACT, `CONTROL_CONTRACT_INVALID:${result?.control_contract}`);
  ensure(result?.first_frame_conditioning_used === true, "FIRST_FRAME_CONTROL_NOT_USED");
  ensure(result?.last_frame_conditioning_used === true, "LAST_FRAME_CONTROL_NOT_USED");
  ensure(result?.reference_condition_count === 2, `WORKER_REFERENCE_COUNT_INVALID:${result?.reference_condition_count}`);
  ensure(Array.isArray(result?.reference_condition_roles) && result.reference_condition_roles.join(",") === "OPENING_FRAME,CLOSING_FRAME", "WORKER_REFERENCE_ROLES_INVALID");
  ensure(result?.modal_gpu === "B200", `GPU_INVALID:${result?.modal_gpu}`);
  ensure(result?.width === WIDTH && result?.height === HEIGHT && result?.fps === FPS && result?.num_inference_steps === 30, "NATIVE_MASTER_SPEC_INVALID");
  ensure(result?.master_is_exact_model_output === true && result?.native_master_generated === true, "NATIVE_MASTER_PROVENANCE_INVALID");
  for (const key of ["pixel_upscale_used", "learned_latent_upsampler_used", "learned_spatial_upscaler_used", "temporal_interpolation_used", "resize_used", "crop_used", "grading_used", "assembly_used", "delivery_transform_used", "automatic_paid_retry", "runpod_inference_performed", "external_provider_contacted"]) {
    ensure(result?.[key] === false, `PROVENANCE_FLAG_INVALID:${key}:${result?.[key]}`);
  }
  ensure(result?.studio_lineage_validated === true && result?.shot_id === expectedShotId, "STUDIO_LINEAGE_NOT_VALIDATED");
}

async function main() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID);
  const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET);
  ensure(tokenId && tokenSecret, "MODAL_CREDENTIALS_REQUIRED");
  const organizationId = requireEnv("AVANTIQO_VIDEO_PROOF_ORGANIZATION_ID");
  const proofKey = requireEnv("AVANTIQO_VIDEO_NATIVE_CONTROL_PROOF_KEY");
  const expectedCallId = requireEnv("AVANTIQO_VIDEO_EXISTING_FUNCTION_CALL_ID");
  const shotId = `video-native-control-proof-${proofKey}`;
  const root = `${organizationId}/certification/video-native-control/${proofKey}`;
  const lockPath = `${root}/paid-proof-lock.json`;
  const outputPath = `${root}/native-master-3840x2176.mp4`;

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const storage = supabase.storage.from(BUCKET);
  const lockBuffer = await downloadBuffer(storage, lockPath);
  const lock = JSON.parse(lockBuffer.toString("utf8"));
  ensure(lock?.contract === ORIGINAL_CONTRACT, `LOCK_CONTRACT_INVALID:${lock?.contract}`);
  ensure(lock?.proof_key === proofKey, `LOCK_PROOF_KEY_INVALID:${lock?.proof_key}`);
  ensure(lock?.function_call_id === expectedCallId, `LOCK_FUNCTION_CALL_MISMATCH:${lock?.function_call_id}`);
  ensure(["SPAWNED", "COMPLETED"].includes(lock?.status), `LOCK_STATUS_INVALID:${lock?.status}`);

  console.log(JSON.stringify({ event: "AVANTIQO_VIDEO_EXACT_FUNCTION_CALL_RECOVERY", proof_key: proofKey, function_call_id: expectedCallId, original_modal_spawn_count: 1, recovery_modal_spawn_count: 0, automatic_paid_retry: false }));
  const client = new modal.ModalClient({ tokenId, tokenSecret });
  const sameCall = await client.functionCalls.fromId(expectedCallId);
  let result;
  let polls = 0;
  for (;;) {
    polls += 1;
    try {
      result = await sameCall.get({ timeoutMs: 0 });
      break;
    } catch (error) {
      if (error instanceof modal.FunctionTimeoutError && /Timeout exceeded:\s*0ms/i.test(text(error?.message))) {
        console.log(`AVANTIQO_VIDEO_RECOVERY_POLL_PENDING=${polls}`);
        if (polls >= MAX_POLLS) throw new Error(`${CONTRACT}_EXISTING_FUNCTION_CALL_STILL_PENDING:${expectedCallId}`);
        await sleep(POLL_MS);
        continue;
      }
      throw error;
    }
  }

  validateGeneration(result, shotId);
  const outputBuffer = await downloadBuffer(storage, outputPath);
  ensure(outputBuffer.length > 1_000_000, `OUTPUT_TOO_SMALL:${outputBuffer.length}`);
  const auditDir = path.resolve("local-audit-output/avantiqo-video-native-control-paid-proof-recovery");
  await fs.mkdir(auditDir, { recursive: true });
  const outputFile = path.join(auditDir, "native-control-master-3840x2176.mp4");
  await fs.writeFile(outputFile, outputBuffer);
  const { probe, evidence } = temporalEvidence(outputFile);
  const video = (probe.streams || []).find((stream) => stream.codec_type === "video");
  const audio = (probe.streams || []).find((stream) => stream.codec_type === "audio");
  ensure(Number(video?.width) === WIDTH && Number(video?.height) === HEIGHT, "FFPROBE_DIMENSIONS_INVALID");
  ensure(Math.abs((ratio(video?.avg_frame_rate || video?.r_frame_rate) || 0) - FPS) < 0.01, "FFPROBE_FPS_INVALID");
  ensure(Boolean(audio), "NATIVE_AUDIO_STREAM_REQUIRED");
  ensure(evidence.audio_video_timing.passed === true, "AUDIO_VIDEO_TIMING_FAILED");

  const report = {
    success: true,
    contract: CONTRACT,
    original_contract: ORIGINAL_CONTRACT,
    proof_key: proofKey,
    modal_function_call_id: expectedCallId,
    original_modal_spawn_count: 1,
    recovery_modal_spawn_count: 0,
    automatic_paid_retry: false,
    recovery_poll_count: polls,
    generation_result: result,
    output: { storage_reference: `storage://${BUCKET}/${outputPath}`, bytes: outputBuffer.length, sha256: sha256(outputBuffer), local_path: outputFile },
    technical: { width: Number(video.width), height: Number(video.height), fps: ratio(video.avg_frame_rate || video.r_frame_rate), audio_present: Boolean(audio), exact_model_output: true },
    temporal_evidence: evidence,
    production_vercel_deploy_performed: false,
    pricing_activation_performed: false,
    provider_routing_activation_performed: false,
    customer_wallet_mutation_performed: false,
  };
  await fs.writeFile(path.join(auditDir, "native-control-paid-proof-recovery.json"), JSON.stringify(report, null, 2));
  const completedLock = { ...lock, status: "COMPLETED", recovered_from_existing_function_call: true, recovery_contract: CONTRACT, recovered_at: new Date().toISOString(), output_storage_reference: report.output.storage_reference, output_sha256: report.output.sha256 };
  const { error: updateError } = await storage.update(lockPath, Buffer.from(JSON.stringify(completedLock, null, 2)), { contentType: "application/json", cacheControl: "3600" });
  if (updateError) throw new Error(`${CONTRACT}_LOCK_UPDATE_FAILED:${updateError.message}`);

  console.log(`${CONTRACT}=PASS`);
  console.log(`AVANTIQO_VIDEO_RECOVERED_FUNCTION_CALL_ID=${expectedCallId}`);
  console.log("AVANTIQO_VIDEO_ORIGINAL_MODAL_SPAWN_COUNT=1");
  console.log("AVANTIQO_VIDEO_RECOVERY_MODAL_SPAWN_COUNT=0");
  console.log("AVANTIQO_VIDEO_GPU_GENERATION_CALLS=1");
  console.log("AVANTIQO_VIDEO_AUTOMATIC_PAID_RETRY=false");
}

main().catch((error) => {
  console.error(`${CONTRACT}=FAIL`);
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
