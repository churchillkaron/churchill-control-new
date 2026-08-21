export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath, resolveCreativeFfprobePath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const TOKEN = "avq-investor-spatial-master-v3-20260821";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const BODY_UNIT_SECONDS = 19.125;
const MASTER_SECONDS = 237.5;
const NARRATION_START_SECONDS = 8;
const NARRATION_SECONDS = 229.5;
const OUT_ROOT = `${ORG}/${PROJECT}/spatial-master-v2`;
const OUTPUT_PATH = `${ORG}/${PROJECT}/spatial-master-v3/avantiqo-investor-film-spatial-master-v3.mp4`;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

function run(command, args, timeoutMs = 720000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1" },
    });
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        reject(new Error("SPATIAL_MASTER_V3_TIMEOUT"));
      }
    }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      const trace = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) reject(new Error(trace.slice(-16000) || `FFMPEG_EXIT_${code}`));
      else resolve(trace);
    });
  });
}

async function project() {
  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("*")
    .eq("id", PROJECT)
    .eq("organization_id", ORG)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("SPATIAL_MASTER_V3_PROJECT_NOT_FOUND");
  return data;
}

async function signed(storagePath, seconds = 7200) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error(`SIGNED_URL_MISSING:${storagePath}`);
  return data.signedUrl;
}

async function ready(storagePath) {
  const dir = storagePath.slice(0, storagePath.lastIndexOf("/"));
  const name = storagePath.slice(storagePath.lastIndexOf("/") + 1);
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(dir, { search: name, limit: 10 });
  if (error) throw error;
  return (data || []).some((item) => item.name === name);
}

async function probe(ffprobePath, input) {
  return new Promise((resolve, reject) => {
    const out = [];
    const err = [];
    const child = spawn(ffprobePath, [
      "-v", "error",
      "-show_entries", "format=duration:stream=index,codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,sample_rate,channels",
      "-of", "json",
      input,
    ], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(Buffer.concat(err).toString("utf8") || `FFPROBE_EXIT_${code}`));
      try { resolve(JSON.parse(Buffer.concat(out).toString("utf8"))); }
      catch (error) { reject(error); }
    });
  });
}

async function upload(localPath) {
  const bytes = await fs.readFile(localPath);
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(OUTPUT_PATH, bytes, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
    metadata: {
      organization_id: ORG,
      creative_project_id: PROJECT,
      master_contract: "AVANTIQO_SPATIAL_INVESTOR_MASTER_V3_CFR",
      checksum,
    },
  });
  if (error) throw error;
  return { bytes: bytes.length, checksum };
}

function videoFilter(index, duration) {
  return `[${index}:v]trim=start=0:end=${duration},setpts=PTS-STARTPTS,fps=24,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p[v${index}]`;
}

async function render() {
  const ffmpeg = resolveCreativeFfmpegPath();
  const ffprobe = resolveCreativeFfprobePath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");
  if (!ffprobe) throw new Error("CREATIVE_MEDIA_FFPROBE_NOT_READY");

  const p = await project();
  const src = p.metadata?.approved_direction_resume?.sources || {};
  const logoPath = String(src.logo_3d || "").trim();
  const narrationPath = String(src.narration || "").trim();
  const scorePath = String(src.score || "").trim();
  if (!logoPath || !narrationPath || !scorePath) throw new Error("SPATIAL_MASTER_V3_LOCKED_SOURCE_MISSING");

  const unitPaths = Array.from({ length: 12 }, (_, i) => `${OUT_ROOT}/units/unit-${String(i + 1).padStart(2, "0")}.mp4`);
  for (let i = 0; i < unitPaths.length; i += 1) {
    if (!(await ready(unitPaths[i]))) throw new Error(`SPATIAL_MASTER_V3_UNIT_NOT_READY:${i + 1}`);
  }

  const [logoUrl, unitUrls, narrationUrl, scoreUrl] = await Promise.all([
    signed(logoPath),
    Promise.all(unitPaths.map((value) => signed(value))),
    signed(narrationPath),
    signed(scorePath),
  ]);

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-spatial-master-v3-"));
  const output = path.join(directory, "master-v3.mp4");
  try {
    const args = ["-y", "-fflags", "+genpts"];
    args.push("-i", logoUrl);
    for (const url of unitUrls) args.push("-i", url);
    args.push("-i", narrationUrl, "-stream_loop", "-1", "-i", scoreUrl);

    const filters = [videoFilter(0, 8)];
    for (let i = 1; i <= 12; i += 1) filters.push(videoFilter(i, BODY_UNIT_SECONDS));
    filters.push(`${Array.from({ length: 13 }, (_, i) => `[v${i}]`).join("")}concat=n=13:v=1:a=0[basev]`);
    filters.push(`[13:a]atrim=start=0:end=${NARRATION_SECONDS},asetpts=PTS-STARTPTS,adelay=${NARRATION_START_SECONDS * 1000}:all=1,aresample=48000,volume=1.0[voice]`);
    filters.push(`[14:a]atrim=start=0:end=${MASTER_SECONDS},asetpts=PTS-STARTPTS,aresample=48000,volume=0.22,afade=t=in:st=0:d=2.5,afade=t=out:st=${MASTER_SECONDS - 4}:d=4[score]`);
    filters.push(`[voice][score]amix=inputs=2:duration=longest:dropout_transition=0,alimiter=limit=0.95[aout]`);

    args.push(
      "-filter_complex", filters.join(";"),
      "-map", "[basev]",
      "-map", "[aout]",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "17",
      "-r", "24",
      "-vsync", "cfr",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "256k",
      "-ar", "48000",
      "-ac", "2",
      "-t", String(MASTER_SECONDS),
      "-movflags", "+faststart",
      output,
    );

    await run(ffmpeg, args, 720000);
    const media = await probe(ffprobe, output);
    const duration = Number(media?.format?.duration || 0);
    const streams = Array.isArray(media?.streams) ? media.streams : [];
    const video = streams.find((stream) => stream.codec_type === "video");
    const audio = streams.find((stream) => stream.codec_type === "audio");
    if (!video || !audio) throw new Error("SPATIAL_MASTER_V3_AV_STREAM_REQUIRED");
    if (Number(video.width) !== 1920 || Number(video.height) !== 1080) throw new Error(`SPATIAL_MASTER_V3_DIMENSIONS_INVALID:${video.width}x${video.height}`);
    if (String(video.r_frame_rate) !== "24/1" && String(video.avg_frame_rate) !== "24/1") throw new Error(`SPATIAL_MASTER_V3_FPS_INVALID:${video.r_frame_rate}:${video.avg_frame_rate}`);
    if (!Number.isFinite(duration) || Math.abs(duration - MASTER_SECONDS) > 0.25) throw new Error(`SPATIAL_MASTER_V3_DURATION_INVALID:${duration}`);

    const stored = await upload(output);
    const metadata = p.metadata || {};
    const prev = metadata.spatial_investor_master_v3 || {};
    const next = {
      ...prev,
      contract: "AVANTIQO_SPATIAL_INVESTOR_MASTER_V3_CFR",
      status: "RENDERED_REVIEW_REQUIRED",
      storage_path: OUTPUT_PATH,
      duration_seconds: duration,
      checksum: stored.checksum,
      bytes: stored.bytes,
      cfr_24fps: true,
      pts_reset_per_segment: true,
      logo_duration_seconds: 8,
      full_screen_ui_ratio: 0,
      sound: {
        narration: { start_seconds: NARRATION_START_SECONDS, duration_seconds: NARRATION_SECONDS, gain: 1 },
        score: { start_seconds: 0, duration_seconds: MASTER_SECONDS, gain: 0.22 },
        source_audio_enabled: false,
      },
      technical_qc: {
        duration_seconds: duration,
        width: Number(video.width),
        height: Number(video.height),
        video_codec: video.codec_name || null,
        frame_rate: video.r_frame_rate || video.avg_frame_rate || null,
        audio_codec: audio.codec_name || null,
        sample_rate: Number(audio.sample_rate || 0) || null,
        channels: Number(audio.channels || 0) || null,
        av_streams_present: true,
      },
      release_review_required: true,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from("creative_projects")
      .update({ metadata: { ...metadata, spatial_investor_master_v3: next }, updated_at: new Date().toISOString() })
      .eq("id", PROJECT)
      .eq("organization_id", ORG);
    if (error) throw error;

    return {
      success: true,
      rendered: true,
      output_path: OUTPUT_PATH,
      signed_url: await signed(OUTPUT_PATH, 86400),
      duration_seconds: duration,
      bytes: stored.bytes,
      checksum: stored.checksum,
      technical_qc: next.technical_qc,
      logo_duration_seconds: 8,
      cfr_24fps: true,
      status: next.status,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

async function status() {
  const p = await project();
  const current = p.metadata?.spatial_investor_master_v3 || {};
  const isReady = await ready(OUTPUT_PATH);
  return {
    success: true,
    ready: isReady,
    status: current.status || "NOT_RENDERED",
    output_path: isReady ? OUTPUT_PATH : null,
    signed_url: isReady ? await signed(OUTPUT_PATH, 86400) : null,
    duration_seconds: current.duration_seconds || MASTER_SECONDS,
    logo_duration_seconds: current.logo_duration_seconds || 8,
    cfr_24fps: current.cfr_24fps === true,
    technical_qc: current.technical_qc || null,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = String(url.searchParams.get("action") || "status").toLowerCase();
    if (action === "status") return json(await status());
    if (action === "render") return json(await render());
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("CREATIVE_INVESTOR_SPATIAL_MASTER_V3_FAILED", { message: error?.message || String(error) });
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
