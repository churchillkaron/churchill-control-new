import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";
import * as modal from "modal";

const CONTRACT = "AVANTIQO_INVESTOR_VISUAL_PROOF_24S_V1";
const ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V2";
const STUDIO_LINEAGE_CONTRACT = "AVANTIQO_VIDEO_STUDIO_LINEAGE_V1";
const SHOT_BIBLE_CONTRACT = "CREATIVE_SHOT_BIBLE_V1";
const MODAL_APP = "avantiqo-video-owned";
const MODAL_FUNCTION = "generate_native_job";
const BUCKET = "creative-assets";
const ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const WIDTH = 3840;
const MODEL_HEIGHT = 2176;
const MASTER_HEIGHT = 2160;
const FPS = 24;
const TARGET_DURATION = 24;
const MAX_GENERATION_WAIT_SECONDS = Math.max(60, Number(process.env.AVANTIQO_INVESTOR_PROOF_MAX_WAIT_SECONDS || 900));

const SOURCE_PATHS = [
  "33336a72-acb5-474e-856b-8be0269360e2/unassigned/eef84bd3-c208-4ed8-bba0-6088a9b67ef9-gemini-thgn4qnk6hof.mp4",
  "9a148429-b6a0-4bc6-ac83-a35c64fb7045/689c3665-dfd5-4a79-83e6-16a26d0780be/organization-imports/ca482d0a-f326-4a3e-ac09-7f919688ad05-98309408-987a-4a85-af2a-59cb4d9b0526-gemini-ozwnk9kaldd9.mp4",
  "33336a72-acb5-474e-856b-8be0269360e2/unassigned/5a56a041-3f60-47ff-a67b-bb011db8874c-gemini-qwgea6koo5yg.mp4",
  "9a148429-b6a0-4bc6-ac83-a35c64fb7045/689c3665-dfd5-4a79-83e6-16a26d0780be/organization-imports/289e604e-ae3c-4f07-9de2-d54ff9ab6668-565e7d39-59d4-4b8e-a024-5cd7940c9722-avantiqo-investor-manager-06833c01-bc17-44c6-b1cf-eef24c60011d.mp4",
];

const SHOTS = [
  {
    id: "physical-stake",
    duration: 5,
    seed: 240501,
    sourceIndex: 0,
    referenceTime: 1.0,
    instruction: "Prestige live-action investor-film shot in a real hospitality receiving area. Begin macro on a delivered carton and packing evidence, then reveal a time-critical supplier short-shipment: a critical item is absent, an empty compartment is unmistakable, and the receiving manager recognizes the exception. The shot must be understandable visually before any product reveal. Natural practical light, authentic skin and materials, restrained cinematic camera movement, real depth, tactile cardboard and stainless steel, physically plausible motion. Native sound: trolley wheel, paper, refrigerator hum, one short pause before a restrained low score begins. No Avantiqo logo, no interface, no browser, no dashboard, no readable generated text, no neon, no hologram, no sci-fi network, no AI-art look.",
  },
  {
    id: "ripple",
    duration: 5,
    seed: 240502,
    sourceIndex: 1,
    referenceTime: 1.2,
    instruction: "Prestige live-action consequence sequence inside the same operating business. In one motivated five-second editorial move, show the supplier exception rippling through reality: kitchen availability changes, a staff member adjusts service, a customer commitment is visibly at risk, and a manager recalculates the operating choice with a real invoice or stock note in hand. The connection between consequences must feel causal, not like a feature montage. Use match action, shallow depth where earned, realistic practical lighting and fast but legible cuts. Native sound forms a tightening rhythm from kitchen, service and paper detail. No product UI yet, no logo, no dashboard, no browser capture, no readable generated text, no floating graphics, no neon, no holograms, no generic corporate stock-film look.",
  },
  {
    id: "avantiqo-recognition",
    duration: 7,
    seed: 240503,
    sourceIndex: 2,
    referenceTime: 0.8,
    instruction: "This is the first controlled Avantiqo reveal after the physical problem. Create a premium photographed workstation/product moment, not a sci-fi HUD. The camera moves from the same delivery evidence into a clean generated Avantiqo operating view on a real display: obsidian-black field, restrained warm-gold continuity cue, crisp off-white geometry, one evidence object visibly connected to three consequence lanes and one proposed governed action. The interface must animate from evidence to shared context to downstream consequence; it must never become a static dashboard or module carousel. Keep generated text absent or abstract so no gibberish appears; deterministic labels will be added in post. Premium optical realism, subtle reflections, real screen luminance, physically plausible camera. Native sound resolves into a precise low pulse with editorial detail. No browser chrome, no screenshot look, no neon, no floating hologram, no unreadable microtext, no fake data wall.",
  },
  {
    id: "human-control-foresight",
    duration: 7,
    seed: 240504,
    sourceIndex: 3,
    referenceTime: 1.0,
    instruction: "Prestige investor-film close with human governance and a quiet foresight seed. First five seconds: the right manager receives the consequential decision with evidence attached, visibly reviews it and makes a deliberate approval/change choice; the governed action then propagates back into the real operation and staff respond. Final two seconds: return to calm physical reality, the disruption is controlled, and the same delivery-event history becomes a subtle early-warning cue for the next risk without a generic prediction dashboard. Human judgment must feel consequential. Natural performance, realistic hands and faces, restrained camera, premium practical light, understated native sound and score with a short pocket of silence near the end. No logo crescendo, no browser, no screenshot, no readable generated text, no neon, no hologram, no floating AI particles, no fake dashboard.",
  },
];

function text(value) { return String(value ?? "").trim(); }
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

function extractReferenceFrame(sourceFile, targetFile, requestedTime) {
  const probe = ffprobe(sourceFile);
  const duration = Number(probe.format?.duration || 0);
  ensure(Number.isFinite(duration) && duration > 0.25, "REFERENCE_SOURCE_DURATION_INVALID");
  const timestamp = Math.max(0.1, Math.min(Number(requestedTime || 0.5), duration - 0.1));
  execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", timestamp.toFixed(3), "-i", sourceFile, "-frames:v", "1", "-q:v", "1", targetFile]);
}

function normalizeShot(source, target, duration) {
  const probe = ffprobe(source);
  const audioPresent = (probe.streams || []).some((stream) => stream.codec_type === "audio");
  const vf = `crop=${WIDTH}:${MASTER_HEIGHT}:0:8,setsar=1,fps=${FPS},format=yuv420p`;
  if (audioPresent) {
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", source, "-t", String(duration), "-vf", vf, "-af", "aresample=48000,aformat=channel_layouts=stereo", "-c:v", "libx264", "-preset", "fast", "-crf", "15", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", target]);
  } else {
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", source, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", String(duration), "-vf", vf, "-c:v", "libx264", "-preset", "fast", "-crf", "15", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", "-shortest", target]);
  }
}

function buildEditorialMaster(normalizedFiles, concatFile, joinedFile, finalFile) {
  const concatBody = normalizedFiles.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n") + "\n";
  return fs.writeFile(concatFile, concatBody).then(() => {
    execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", joinedFile]);
    const regular = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
    const bold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
    const gold = "#D6A66A";
    const white = "#F4F1EA";
    const filter = [
      `drawbox=x=170:y=154:w=1260:h=238:color=black@0.62:t=fill:enable='between(t,10,17)'`,
      `drawbox=x=170:y=154:w=10:h=238:color=${gold}@0.96:t=fill:enable='between(t,10,17)'`,
      `drawtext=fontfile=${bold}:text='AVANTIQO':fontcolor=${gold}:fontsize=54:x=225:y=194:enable='between(t,10,17)'`,
      `drawtext=fontfile=${regular}:text='ONE EVENT. SHARED CONTEXT.':fontcolor=${white}:fontsize=44:x=225:y=266:enable='between(t,10,17)'`,
      `drawtext=fontfile=${regular}:text='SUPPLY  ·  OPERATIONS  ·  FINANCE':fontcolor=${white}@0.78:fontsize=32:x=225:y=332:enable='between(t,10,17)'`,
      `drawbox=x=170:y=154:w=1120:h=202:color=black@0.62:t=fill:enable='between(t,17,22)'`,
      `drawbox=x=170:y=154:w=10:h=202:color=${gold}@0.96:t=fill:enable='between(t,17,22)'`,
      `drawtext=fontfile=${bold}:text='GOVERNED ACTION':fontcolor=${gold}:fontsize=50:x=225:y=196:enable='between(t,17,22)'`,
      `drawtext=fontfile=${regular}:text='Human judgment required':fontcolor=${white}:fontsize=42:x=225:y=278:enable='between(t,17,22)'`,
    ].join(",");
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", joinedFile, "-t", String(TARGET_DURATION), "-vf", filter, "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-profile:v", "high", "-level", "5.2", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", finalFile]);
  });
}

async function cancelGeneratedCall(client, functionCallId, reason) {
  if (!functionCallId) return;
  try {
    const sameCall = await client.functionCalls.fromId(functionCallId);
    await sameCall.cancel({ terminateContainers: true });
    console.error(`AVANTIQO_INVESTOR_PROOF_FUNCTION_CALL_CANCELLED=${functionCallId}:reason=${reason}`);
  } catch (error) {
    console.error(`AVANTIQO_INVESTOR_PROOF_FUNCTION_CALL_CANCEL_FAILED=${functionCallId}:${text(error?.message)}`);
  }
}

async function generateOneShot(client, worker, item) {
  let functionCallId = "";
  const deadline = Date.now() + MAX_GENERATION_WAIT_SECONDS * 1000;
  try {
    const call = await worker.spawn([item.payload]);
    functionCallId = text(call.functionCallId);
    ensure(functionCallId, `FUNCTION_CALL_ID_REQUIRED:${item.index + 1}`);
    console.log(`AVANTIQO_INVESTOR_PROOF_FUNCTION_CALL_${item.index + 1}=${functionCallId}`);
    let polls = 0;
    for (;;) {
      polls += 1;
      if (Date.now() >= deadline) {
        throw new Error(`${CONTRACT}_GENERATION_DEADLINE_EXCEEDED:${item.index + 1}:${MAX_GENERATION_WAIT_SECONDS}s`);
      }
      const sameCall = await client.functionCalls.fromId(functionCallId);
      try {
        const result = await sameCall.get({ timeoutMs: 0 });
        ensure(result?.success === true, `GENERATION_FAILED:${item.index + 1}`);
        ensure(result?.gpu_generation_calls === 1, `GPU_CALL_COUNT_INVALID:${item.index + 1}`);
        ensure(Number(result?.width) === WIDTH && Number(result?.height) === MODEL_HEIGHT, `MODEL_DIMENSIONS_INVALID:${item.index + 1}`);
        return { ...item, functionCallId, polls, result };
      } catch (error) {
        if (error instanceof modal.FunctionTimeoutError && /Timeout exceeded:\s*0ms/i.test(text(error?.message))) {
          if (polls % 6 === 0) console.log(`AVANTIQO_INVESTOR_PROOF_PENDING_${item.index + 1}=${polls}`);
          await sleep(10000);
          continue;
        }
        throw error;
      }
    }
  } catch (error) {
    await cancelGeneratedCall(client, functionCallId, `shot-${item.index + 1}-failure`);
    throw error;
  }
}

async function main() {
  ensure(approved(process.env.AVANTIQO_INVESTOR_PROOF_REAL_INFERENCE_APPROVED), "REAL_INFERENCE_APPROVAL_REQUIRED");
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID);
  const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET);
  ensure(tokenId && tokenSecret, "MODAL_CREDENTIALS_REQUIRED");

  const runKey = text(process.env.AVANTIQO_INVESTOR_PROOF_RUN_KEY) || text(process.env.GITHUB_SHA).slice(0, 12) || Date.now().toString(36);
  const root = `${ORGANIZATION_ID}/investor-film-visual-proof-20260904/${runKey}`;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-investor-proof-24s-"));
  const auditDir = path.resolve("local-audit-output/avantiqo-investor-visual-proof-24s");
  await fs.mkdir(auditDir, { recursive: true });

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const storage = supabase.storage.from(BUCKET);
  const client = new modal.ModalClient({ tokenId, tokenSecret });
  const lookupOptions = text(process.env.MODAL_ENVIRONMENT) ? { environment: text(process.env.MODAL_ENVIRONMENT) } : {};
  const worker = await client.functions.fromName(MODAL_APP, MODAL_FUNCTION, lookupOptions);

  const prepared = [];
  for (let index = 0; index < SHOTS.length; index += 1) {
    const shot = SHOTS[index];
    const sourcePath = SOURCE_PATHS[shot.sourceIndex];
    const sourceBuffer = await downloadBuffer(storage, sourcePath);
    ensure(sourceBuffer.length > 100000, `SOURCE_TOO_SMALL:${index + 1}`);
    const sourceFile = path.join(temp, `source-${index + 1}.mp4`);
    const referenceFile = path.join(temp, `reference-${index + 1}.jpg`);
    await fs.writeFile(sourceFile, sourceBuffer);
    extractReferenceFrame(sourceFile, referenceFile, shot.referenceTime);
    const referenceBuffer = await fs.readFile(referenceFile);
    ensure(referenceBuffer.length > 15000, `REFERENCE_TOO_SMALL:${index + 1}`);
    const referencePath = `${root}/references/shot-${index + 1}.jpg`;
    await uploadBuffer(storage, referencePath, referenceBuffer, "image/jpeg", false);
    const referenceUrl = await signedUrl(storage, referencePath, 7200);
    const outputPath = `${root}/generated/shot-${index + 1}-${shot.id}-3840x2176.mp4`;
    const uploadUrl = await signedUploadUrl(storage, outputPath);
    const shotId = `investor-proof-24s-${runKey}-${index + 1}-${shot.id}`;
    const shotBible = {
      contract: SHOT_BIBLE_CONTRACT,
      shot_id: shotId,
      organization_id: ORGANIZATION_ID,
      purpose: shot.id,
      story: { beat: shot.id, causal_thread: true },
      camera: { language: "premium physically plausible cinematic movement" },
      lighting: { intent: "real premium practical light, restrained warm-gold continuity" },
      negative_constraints: ["screenshots", "browser capture", "static dashboard", "neon HUD", "holograms", "readable generated text", "AI-art look"],
      output: { duration_seconds: shot.duration, frame_rate: FPS, resolution: `${WIDTH}x${MODEL_HEIGHT}`, aspect_ratio: "16:9" },
      generation_instruction: shot.instruction,
    };
    const payload = {
      contract: ENGINE_CONTRACT,
      capability: "ai.video.image_to_video",
      model: "avantiqo-ltx-2.5",
      instruction: shot.instruction,
      organization_id: ORGANIZATION_ID,
      usage_id: `investor-proof-24s-${runKey}-${index + 1}`,
      source_urls: [referenceUrl],
      source_assets: [referenceUrl],
      structured_specification: {
        generation: { duration_seconds: shot.duration, fps: FPS, resolution: `${WIDTH}x${MODEL_HEIGHT}`, aspect_ratio: "16:9", seed: shot.seed },
        output_spec: { duration_seconds: shot.duration, fps: FPS, resolution: `${WIDTH}x${MODEL_HEIGHT}`, aspect_ratio: "16:9" },
        metadata: { studio_lineage: { contract: STUDIO_LINEAGE_CONTRACT, shot_id: shotId, shot_bible: shotBible }, investor_visual_proof_contract: CONTRACT, creative_lock_version: "AVANTIQO_INVESTOR_FILM_CREATIVE_LOCK_V1" },
      },
      storage_upload: { signed_url: uploadUrl, storage_reference: storageRef(outputPath) },
    };
    prepared.push({ index, shot, shotId, sourcePath, referencePath, outputPath, payload });
  }

  console.log(JSON.stringify({ event: "AVANTIQO_INVESTOR_VISUAL_PROOF_SEQUENTIAL_START", shot_count: prepared.length, total_duration_seconds: TARGET_DURATION, gpu_jobs: prepared.length, simultaneous_gpu_jobs: 1, automatic_paid_retry: false }));
  const completed = [];
  for (const item of prepared) {
    console.log(`AVANTIQO_INVESTOR_PROOF_SHOT_START=${item.index + 1}:${item.shot.id}`);
    const generated = await generateOneShot(client, worker, item);
    completed.push(generated);
    console.log(`AVANTIQO_INVESTOR_PROOF_SHOT_COMPLETE=${item.index + 1}:${item.shot.id}`);
  }

  const normalizedFiles = [];
  const shotReports = [];
  for (const item of completed.sort((a, b) => a.index - b.index)) {
    const buffer = await downloadBuffer(storage, item.outputPath);
    ensure(buffer.length > 1000000, `GENERATED_OUTPUT_TOO_SMALL:${item.index + 1}`);
    const rawFile = path.join(temp, `generated-${item.index + 1}.mp4`);
    const normalizedFile = path.join(temp, `normalized-${item.index + 1}.mp4`);
    await fs.writeFile(rawFile, buffer);
    normalizeShot(rawFile, normalizedFile, item.shot.duration);
    normalizedFiles.push(normalizedFile);
    shotReports.push({
      shot: item.index + 1,
      beat: item.shot.id,
      duration_seconds: item.shot.duration,
      function_call_id: item.functionCallId,
      modal_polls: item.polls,
      source_path: item.sourcePath,
      reference_path: item.referencePath,
      output_storage_reference: storageRef(item.outputPath),
      generation_result: item.result,
    });
  }

  const concatFile = path.join(temp, "concat.txt");
  const joinedFile = path.join(temp, "joined.mp4");
  const finalFile = path.join(auditDir, "avantiqo-investor-visual-proof-24s-4k.mp4");
  await buildEditorialMaster(normalizedFiles, concatFile, joinedFile, finalFile);

  const finalProbe = ffprobe(finalFile);
  const finalVideo = (finalProbe.streams || []).find((stream) => stream.codec_type === "video");
  const finalAudio = (finalProbe.streams || []).find((stream) => stream.codec_type === "audio");
  const finalDuration = Number(finalProbe.format?.duration || 0);
  ensure(Number(finalVideo?.width) === WIDTH && Number(finalVideo?.height) === MASTER_HEIGHT, "FINAL_4K_DIMENSIONS_INVALID");
  ensure(finalAudio, "FINAL_AUDIO_REQUIRED");
  ensure(Math.abs(finalDuration - TARGET_DURATION) <= 0.08, `FINAL_DURATION_INVALID:${finalDuration}`);

  const finalBuffer = await fs.readFile(finalFile);
  const finalStoragePath = `${root}/master/avantiqo-investor-visual-proof-24s-4k.mp4`;
  await uploadBuffer(storage, finalStoragePath, finalBuffer, "video/mp4", false);
  const finalSignedUrl = await signedUrl(storage, finalStoragePath, 60 * 60 * 24 * 7);

  const report = {
    success: true,
    contract: CONTRACT,
    creative_lock_version: "AVANTIQO_INVESTOR_FILM_CREATIVE_LOCK_V1",
    proof_type: "VIDEO_GENERATION_ONLY",
    organization_id: ORGANIZATION_ID,
    run_key: runKey,
    target_duration_seconds: TARGET_DURATION,
    actual_duration_seconds: finalDuration,
    master_resolution: `${WIDTH}x${MASTER_HEIGHT}`,
    screenshot_or_browser_capture_used: false,
    image_generation_used: false,
    generated_video_shot_count: SHOTS.length,
    gpu_generation_calls: SHOTS.length,
    automatic_paid_retry: false,
    shots: shotReports,
    final_output: { storage_reference: storageRef(finalStoragePath), signed_url: finalSignedUrl, bytes: finalBuffer.length, local_path: finalFile },
  };
  await fs.writeFile(path.join(auditDir, "avantiqo-investor-visual-proof-24s-report.json"), JSON.stringify(report, null, 2));
  console.log(`${CONTRACT}=PASS`);
  console.log(`AVANTIQO_INVESTOR_VISUAL_PROOF_OUTPUT=${storageRef(finalStoragePath)}`);
  console.log(`AVANTIQO_INVESTOR_VISUAL_PROOF_SIGNED_URL=${finalSignedUrl}`);
  console.log(`AVANTIQO_INVESTOR_VISUAL_PROOF_DURATION=${finalDuration}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
