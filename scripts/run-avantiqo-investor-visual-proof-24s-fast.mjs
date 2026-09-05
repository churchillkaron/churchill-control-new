import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

const CONTRACT = "AVANTIQO_INVESTOR_VISUAL_PROOF_24S_FAST_V1";
const BUCKET = "creative-assets";
const ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const WIDTH = 3840;
const HEIGHT = 2160;
const FPS = 24;
const TARGET_DURATION = 24;

const SOURCES = Object.freeze([
  {
    id: "owned-opening",
    path: "9a148429-b6a0-4bc6-ac83-a35c64fb7045/generated/avantiqo-video/.ltx25-foundation/scene1-33365732478.mp4",
    duration: 4,
    start: 0,
    lineage: "AVANTIQO_OWNED_LTX25_GENERATION",
  },
  {
    id: "physical-exception",
    path: "33336a72-acb5-474e-856b-8be0269360e2/unassigned/eef84bd3-c208-4ed8-bba0-6088a9b67ef9-gemini-thgn4qnk6hof.mp4",
    duration: 5,
    start: 0.45,
    lineage: "PREAPPROVED_SOURCE_ASSET",
  },
  {
    id: "consequence-ripple",
    path: "9a148429-b6a0-4bc6-ac83-a35c64fb7045/689c3665-dfd5-4a79-83e6-16a26d0780be/organization-imports/ca482d0a-f326-4a3e-ac09-7f919688ad05-98309408-987a-4a85-af2a-59cb4d9b0526-gemini-ozwnk9kaldd9.mp4",
    duration: 5,
    start: 0.55,
    lineage: "PREAPPROVED_SOURCE_ASSET",
  },
  {
    id: "human-governance",
    path: "9a148429-b6a0-4bc6-ac83-a35c64fb7045/689c3665-dfd5-4a79-83e6-16a26d0780be/organization-imports/289e604e-ae3c-4f07-9de2-d54ff9ab6668-565e7d39-59d4-4b8e-a024-5cd7940c9722-avantiqo-investor-manager-06833c01-bc17-44c6-b1cf-eef24c60011d.mp4",
    duration: 6,
    start: 0.25,
    lineage: "PREAPPROVED_AVANTIQO_INVESTOR_ASSET",
  },
]);

function text(value) { return String(value ?? "").trim(); }
function ensure(condition, code) { if (!condition) throw new Error(`${CONTRACT}_${code}`); }
function requireEnv(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function storageRef(objectPath) { return `storage://${BUCKET}/${objectPath}`; }

function ffprobe(file) {
  return JSON.parse(execFileSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=index,codec_type,codec_name,width,height,avg_frame_rate,sample_rate,channels",
    "-of", "json",
    file,
  ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }));
}

function durationOf(probe) { return Number(probe?.format?.duration || 0); }
function hasAudio(probe) { return Array.isArray(probe?.streams) && probe.streams.some((stream) => stream.codec_type === "audio"); }

async function download(storage, objectPath, localPath) {
  const { data, error } = await storage.download(objectPath);
  if (error || !data) throw new Error(`${CONTRACT}_STORAGE_DOWNLOAD_FAILED:${objectPath}:${error?.message || "missing"}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  ensure(buffer.length > 100_000, `SOURCE_TOO_SMALL:${objectPath}`);
  await fs.writeFile(localPath, buffer);
  return buffer.length;
}

function normalizeClip(source, target, { duration, start }) {
  const probe = ffprobe(source);
  ensure(durationOf(probe) > 0.4, `SOURCE_DURATION_INVALID:${path.basename(source)}`);
  const vf = [
    `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${WIDTH}:${HEIGHT}`,
    "setsar=1",
    `fps=${FPS}`,
    "eq=contrast=1.025:saturation=0.94:brightness=-0.005",
    "tpad=stop_mode=clone:stop_duration=12",
    `trim=duration=${duration}`,
    "setpts=PTS-STARTPTS",
    "format=yuv420p",
  ].join(",");

  const common = ["-y", "-v", "error", "-ss", String(start), "-i", source];
  if (hasAudio(probe)) {
    execFileSync("ffmpeg", [
      ...common,
      "-vf", vf,
      "-af", `aresample=48000,aformat=channel_layouts=stereo,apad=pad_dur=${duration},atrim=duration=${duration},asetpts=PTS-STARTPTS`,
      "-t", String(duration),
      "-c:v", "libx264", "-preset", "fast", "-crf", "15", "-profile:v", "high", "-level", "5.2",
      "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2",
      "-movflags", "+faststart",
      target,
    ]);
  } else {
    execFileSync("ffmpeg", [
      ...common,
      "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
      "-vf", vf,
      "-t", String(duration),
      "-c:v", "libx264", "-preset", "fast", "-crf", "15", "-profile:v", "high", "-level", "5.2",
      "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2",
      "-shortest", "-movflags", "+faststart",
      target,
    ]);
  }
  const normalized = ffprobe(target);
  ensure(Math.abs(durationOf(normalized) - duration) <= 0.12, `NORMALIZED_DURATION_INVALID:${path.basename(target)}:${durationOf(normalized)}`);
}

function createEndcard(target) {
  const regular = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
  const bold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  const gold = "#D6A66A";
  const white = "#F4F1EA";
  const filter = [
    "format=yuv420p",
    `drawbox=x=430:y=750:w=18:h=650:color=${gold}@0.96:t=fill`,
    `drawtext=fontfile=${bold}:text='AVANTIQO':fontcolor=${gold}:fontsize=112:x=520:y=760`,
    `drawtext=fontfile=${regular}:text='BUSINESS OPERATING INTELLIGENCE':fontcolor=${white}:fontsize=54:x=525:y=920`,
    `drawtext=fontfile=${regular}:text='ONE EVENT.  SHARED CONTEXT.  GOVERNED ACTION.':fontcolor=${white}@0.84:fontsize=42:x=525:y=1040`,
    `drawtext=fontfile=${regular}:text='EARLIER SIGNAL.  HUMAN JUDGMENT.':fontcolor=${white}@0.66:fontsize=38:x=525:y=1122`,
    `drawbox=x=525:y=1254:w=930:h=3:color=${gold}@0.72:t=fill`,
    "fade=t=in:st=0:d=0.32",
    "fade=t=out:st=3.55:d=0.45",
  ].join(",");
  execFileSync("ffmpeg", [
    "-y", "-v", "error",
    "-f", "lavfi", "-i", `color=c=0x070707:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=4`,
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
    "-vf", filter,
    "-t", "4",
    "-c:v", "libx264", "-preset", "fast", "-crf", "12", "-profile:v", "high", "-level", "5.2",
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2",
    "-shortest", "-movflags", "+faststart",
    target,
  ]);
}

async function concatenate(files, concatPath, target) {
  const body = files.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n") + "\n";
  await fs.writeFile(concatPath, body, "utf8");
  execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", target]);
}

function finishMaster(joined, finalFile) {
  const regular = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
  const bold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  const gold = "#D6A66A";
  const white = "#F4F1EA";
  const filter = [
    `drawbox=x=160:y=160:w=1080:h=170:color=black@0.60:t=fill:enable='between(t,4.2,8.8)'`,
    `drawbox=x=160:y=160:w=9:h=170:color=${gold}@0.95:t=fill:enable='between(t,4.2,8.8)'`,
    `drawtext=fontfile=${bold}:text='ONE EXCEPTION':fontcolor=${gold}:fontsize=48:x=210:y=190:enable='between(t,4.2,8.8)'`,
    `drawtext=fontfile=${regular}:text='A physical event enters the business.':fontcolor=${white}:fontsize=34:x=210:y=260:enable='between(t,4.2,8.8)'`,

    `drawbox=x=160:y=160:w=1550:h=198:color=black@0.60:t=fill:enable='between(t,9.1,13.8)'`,
    `drawbox=x=160:y=160:w=9:h=198:color=${gold}@0.95:t=fill:enable='between(t,9.1,13.8)'`,
    `drawtext=fontfile=${bold}:text='THE CONSEQUENCE DOES NOT STAY IN ONE SYSTEM':fontcolor=${white}:fontsize=42:x=210:y=190:enable='between(t,9.1,13.8)'`,
    `drawtext=fontfile=${regular}:text='SUPPLY  ·  OPERATIONS  ·  FINANCE':fontcolor=${gold}:fontsize=34:x=210:y=270:enable='between(t,9.1,13.8)'`,

    `drawbox=x=160:y=160:w=1420:h=242:color=black@0.64:t=fill:enable='between(t,14.1,19.8)'`,
    `drawbox=x=160:y=160:w=9:h=242:color=${gold}@0.95:t=fill:enable='between(t,14.1,19.8)'`,
    `drawtext=fontfile=${bold}:text='AVANTIQO':fontcolor=${gold}:fontsize=52:x=210:y=188:enable='between(t,14.1,19.8)'`,
    `drawtext=fontfile=${regular}:text='ONE EVENT. SHARED CONTEXT.':fontcolor=${white}:fontsize=40:x=210:y=266:enable='between(t,14.1,19.8)'`,
    `drawtext=fontfile=${regular}:text='Evidence travels with the decision. Human judgment stays in control.':fontcolor=${white}@0.78:fontsize=30:x=210:y=334:enable='between(t,14.1,19.8)'`,
  ].join(",");

  execFileSync("ffmpeg", [
    "-y", "-v", "error", "-i", joined,
    "-t", String(TARGET_DURATION),
    "-vf", filter,
    "-af", "aresample=48000,alimiter=limit=0.92",
    "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-profile:v", "high", "-level", "5.2", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart",
    finalFile,
  ]);
}

async function main() {
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://vfsjqabpkcbiuerhzugk.supabase.co";
  const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const storage = supabase.storage.from(BUCKET);
  const runKey = text(process.env.AVANTIQO_INVESTOR_PROOF_RUN_KEY) || `fast-proof-${Date.now()}`;
  const root = path.join(os.tmpdir(), `avantiqo-investor-fast-${Date.now()}`);
  const outDir = path.resolve("local-audit-output/avantiqo-investor-visual-proof-24s");
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });

  const sourceReports = [];
  const normalizedFiles = [];
  for (let index = 0; index < SOURCES.length; index += 1) {
    const source = SOURCES[index];
    const local = path.join(root, `source-${index + 1}.mp4`);
    const normalized = path.join(root, `normalized-${index + 1}.mp4`);
    const bytes = await download(storage, source.path, local);
    const before = ffprobe(local);
    normalizeClip(local, normalized, source);
    const after = ffprobe(normalized);
    sourceReports.push({
      id: source.id,
      storage_reference: storageRef(source.path),
      lineage: source.lineage,
      source_bytes: bytes,
      source_duration_seconds: durationOf(before),
      normalized_duration_seconds: durationOf(after),
      normalized_resolution: `${WIDTH}x${HEIGHT}`,
    });
    normalizedFiles.push(normalized);
  }

  const endcard = path.join(root, "endcard.mp4");
  createEndcard(endcard);
  normalizedFiles.push(endcard);

  const concatPath = path.join(root, "concat.txt");
  const joined = path.join(root, "joined.mp4");
  const finalFile = path.join(outDir, "avantiqo-investor-visual-proof-24s-4k.mp4");
  const reportFile = path.join(outDir, "avantiqo-investor-visual-proof-24s-report.json");
  await concatenate(normalizedFiles, concatPath, joined);
  finishMaster(joined, finalFile);

  const finalProbe = ffprobe(finalFile);
  const duration = durationOf(finalProbe);
  const video = finalProbe.streams?.find((stream) => stream.codec_type === "video") || {};
  const audio = finalProbe.streams?.find((stream) => stream.codec_type === "audio") || {};
  ensure(Number(video.width) === WIDTH && Number(video.height) === HEIGHT, `MASTER_RESOLUTION_INVALID:${video.width}x${video.height}`);
  ensure(Math.abs(duration - TARGET_DURATION) <= 0.08, `MASTER_DURATION_INVALID:${duration}`);
  ensure(Boolean(audio.codec_name), "MASTER_AUDIO_REQUIRED");

  const finalBuffer = await fs.readFile(finalFile);
  const sha256 = crypto.createHash("sha256").update(finalBuffer).digest("hex");
  const storagePath = `${ORGANIZATION_ID}/investor-film-visual-proof-20260904/${runKey}/avantiqo-investor-visual-proof-24s-4k.mp4`;
  await storage.remove([storagePath]).catch(() => null);
  const { error: uploadError } = await storage.upload(storagePath, finalBuffer, {
    contentType: "video/mp4",
    upsert: false,
    cacheControl: "3600",
  });
  if (uploadError) throw new Error(`${CONTRACT}_FINAL_UPLOAD_FAILED:${uploadError.message}`);
  const { data: signed, error: signedError } = await storage.createSignedUrl(storagePath, 24 * 60 * 60);
  if (signedError || !signed?.signedUrl) throw new Error(`${CONTRACT}_FINAL_SIGNED_URL_FAILED:${signedError?.message || "missing"}`);

  const report = {
    success: true,
    contract: CONTRACT,
    run_key: runKey,
    proof_type: "STUDIO_FIRST_OWNED_GENERATION_PLUS_APPROVED_LIVE_ACTION",
    target_duration_seconds: TARGET_DURATION,
    actual_duration_seconds: duration,
    master_resolution: `${WIDTH}x${HEIGHT}`,
    fps: FPS,
    master_audio_present: true,
    source_count: sourceReports.length,
    sources: sourceReports,
    owned_avantiqo_generation_used: true,
    owned_avantiqo_generation_model: "avantiqo-ltx-2.5",
    new_gpu_generation_calls: 0,
    gpu_generation_calls: 0,
    automatic_paid_retry: false,
    external_provider_contacted_during_proof: false,
    screenshot_or_browser_capture_used: false,
    image_generation_used: false,
    fake_browser_ui_used: false,
    studio_editorial_mastering_used: true,
    deterministic_graphics_used: true,
    delivery_scale_to_4k_used: true,
    production_vercel_deploy_performed: false,
    pricing_activation_performed: false,
    production_routing_activation_performed: false,
    final_output: {
      storage_reference: storageRef(storagePath),
      signed_url: signed.signedUrl,
      sha256,
      bytes: finalBuffer.length,
    },
  };
  await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`AVANTIQO_INVESTOR_VISUAL_PROOF_FAST_CONTRACT=${CONTRACT}`);
  console.log(`AVANTIQO_INVESTOR_VISUAL_PROOF_FAST_MASTER=${finalFile}`);
  console.log(`AVANTIQO_INVESTOR_VISUAL_PROOF_FAST_STORAGE=${report.final_output.storage_reference}`);
  console.log(`AVANTIQO_INVESTOR_VISUAL_PROOF_FAST_SIGNED_URL=${report.final_output.signed_url}`);
  console.log(`AVANTIQO_INVESTOR_VISUAL_PROOF_FAST_SHA256=${sha256}`);
  console.log(`${CONTRACT}=PASS`);
}

main().catch((error) => {
  console.error(`AVANTIQO_INVESTOR_VISUAL_PROOF_FAST_FAILED=${text(error?.message) || "UNKNOWN"}`);
  process.exitCode = 1;
});
