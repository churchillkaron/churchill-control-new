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

const TOKEN = "avq-investor-spatial-fast-master-20260821";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const UNIT = 19.125;
const MASTER = 237.5;
const NARRATION_START = 8;
const OUT_ROOT = `${ORG}/${PROJECT}/spatial-master-v2`;
const OUTPUT_PATH = `${OUT_ROOT}/avantiqo-investor-film-spatial-master-v2.mp4`;

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
        reject(new Error("SPATIAL_FAST_MASTER_TIMEOUT"));
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
  if (!data) throw new Error("SPATIAL_FAST_MASTER_PROJECT_NOT_FOUND");
  return data;
}

async function signed(storagePath, seconds = 3600) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error(`SIGNED_URL_MISSING:${storagePath}`);
  return data.signedUrl;
}

async function outputReady() {
  const dir = OUTPUT_PATH.slice(0, OUTPUT_PATH.lastIndexOf("/"));
  const name = OUTPUT_PATH.slice(OUTPUT_PATH.lastIndexOf("/") + 1);
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(dir, { search: name, limit: 10 });
  if (error) throw error;
  return (data || []).some((item) => item.name === name);
}

async function ffprobe(ffprobePath, filePath) {
  const stdout = [];
  const stderr = [];
  await new Promise((resolve, reject) => {
    const child = spawn(ffprobePath, [
      "-v", "error",
      "-show_entries", "format=duration,size:stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels",
      "-of", "json",
      filePath,
    ], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(Buffer.concat(stderr).toString("utf8") || `FFPROBE_EXIT_${code}`));
      else resolve();
    });
  });
  return JSON.parse(Buffer.concat(stdout).toString("utf8"));
}

function videoStream(probe) {
  return (Array.isArray(probe?.streams) ? probe.streams : []).find((stream) => stream.codec_type === "video") || null;
}

function assertSpatialUnit1080(probe, label) {
  const stream = videoStream(probe);
  if (!stream) throw new Error(`SPATIAL_UNIT_VIDEO_MISSING:${label}`);
  if (Number(stream.width) !== 1920 || Number(stream.height) !== 1080) {
    throw new Error(`SPATIAL_UNIT_DIMENSIONS_INVALID:${label}:${stream.width}x${stream.height}`);
  }
  return stream;
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
      master_contract: "AVANTIQO_SPATIAL_INVESTOR_MASTER_V2_FAST",
      checksum,
    },
  });
  if (error) throw error;
  return { bytes: bytes.length, checksum };
}

async function render() {
  const ffmpeg = resolveCreativeFfmpegPath();
  const ffprobePath = resolveCreativeFfprobePath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");
  if (!ffprobePath) throw new Error("CREATIVE_MEDIA_FFPROBE_NOT_READY");

  const p = await project();
  const src = p.metadata?.approved_direction_resume?.sources || {};
  const logoPath = String(src.logo_3d || "").trim();
  const narrationPath = String(src.narration || "").trim();
  const scorePath = String(src.score || "").trim();
  if (!logoPath || !narrationPath || !scorePath) throw new Error("SPATIAL_FAST_MASTER_LOCKED_SOURCE_MISSING");

  const unitPaths = Array.from(
    { length: 12 },
    (_, index) => `${OUT_ROOT}/units/unit-${String(index + 1).padStart(2, "0")}.mp4`,
  );

  const [logoUrl, unitUrls, narrationUrl, scoreUrl] = await Promise.all([
    signed(logoPath, 7200),
    Promise.all(unitPaths.map((value) => signed(value, 7200))),
    signed(narrationPath, 7200),
    signed(scorePath, 7200),
  ]);

  const [firstUnitProbe, lastUnitProbe] = await Promise.all([
    ffprobe(ffprobePath, unitUrls[0]),
    ffprobe(ffprobePath, unitUrls[unitUrls.length - 1]),
  ]);
  const firstUnitVideo = assertSpatialUnit1080(firstUnitProbe, "unit-01");
  const lastUnitVideo = assertSpatialUnit1080(lastUnitProbe, "unit-12");

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-spatial-fast-master-"));
  try {
    const normalizedLogo = path.join(directory, "logo-1080p.mp4");
    const concatList = path.join(directory, "visuals.concat.txt");
    const visualOut = path.join(directory, "visuals.mp4");
    const finished = path.join(directory, "spatial-master-v2.mp4");

    await run(ffmpeg, [
      "-y",
      "-i", logoUrl,
      "-t", "8",
      "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,fps=24",
      "-an",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "14",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      normalizedLogo,
    ], 120000);

    const normalizedLogoProbe = await ffprobe(ffprobePath, normalizedLogo);
    assertSpatialUnit1080(normalizedLogoProbe, "logo-normalized");

    const concatSources = [normalizedLogo, ...unitUrls];
    await fs.writeFile(
      concatList,
      concatSources.map((value) => `file '${String(value).replace(/'/g, "'\\''")}'`).join("\n"),
      "utf8",
    );

    await run(ffmpeg, [
      "-y",
      "-protocol_whitelist", "file,http,https,tcp,tls,crypto",
      "-f", "concat",
      "-safe", "0",
      "-i", concatList,
      "-an",
      "-c:v", "copy",
      "-movflags", "+faststart",
      visualOut,
    ], 240000);

    const visualProbe = await ffprobe(ffprobePath, visualOut);
    const visualStream = assertSpatialUnit1080(visualProbe, "joined-visuals");

    await run(ffmpeg, [
      "-y",
      "-i", visualOut,
      "-i", narrationUrl,
      "-stream_loop", "-1",
      "-i", scoreUrl,
      "-filter_complex", [
        `[1:a]atrim=0:229.5,asetpts=PTS-STARTPTS,adelay=${NARRATION_START * 1000}|${NARRATION_START * 1000},volume=1.0[voice]`,
        `[2:a]atrim=0:${MASTER},asetpts=PTS-STARTPTS,volume=0.22,afade=t=in:st=0:d=2.5,afade=t=out:st=${MASTER - 4}:d=4[score]`,
        "[voice][score]amix=inputs=2:duration=longest:dropout_transition=0,alimiter=limit=0.95[aout]",
      ].join(";"),
      "-map", "0:v:0",
      "-map", "[aout]",
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "256k",
      "-ar", "48000",
      "-ac", "2",
      "-t", String(MASTER),
      "-movflags", "+faststart",
      finished,
    ], 300000);

    const probe = await ffprobe(ffprobePath, finished);
    const duration = Number(probe?.format?.duration || 0);
    if (!Number.isFinite(duration) || Math.abs(duration - MASTER) > 0.35) {
      throw new Error(`SPATIAL_FAST_MASTER_DURATION_INVALID:${duration}`);
    }
    const streams = Array.isArray(probe?.streams) ? probe.streams : [];
    const video = streams.find((stream) => stream.codec_type === "video");
    const audio = streams.find((stream) => stream.codec_type === "audio");
    if (!video || !audio) throw new Error("SPATIAL_FAST_MASTER_AV_STREAM_REQUIRED");
    if (Number(video.width) !== 1920 || Number(video.height) !== 1080) {
      throw new Error(`SPATIAL_FAST_MASTER_DIMENSIONS_INVALID:${video.width}x${video.height}`);
    }

    const stored = await upload(finished);
    const metadata = p.metadata || {};
    const current = metadata.spatial_investor_master_v2 || {};
    const next = {
      ...current,
      contract: "AVANTIQO_SPATIAL_INVESTOR_MASTER_V2_FAST",
      status: "RENDERED_REVIEW_REQUIRED",
      storage_path: OUTPUT_PATH,
      duration_seconds: duration,
      checksum: stored.checksum,
      bytes: stored.bytes,
      full_screen_ui_ratio: 0,
      fast_stream_copy: true,
      logo_normalized_to_1080p: true,
      sound: {
        narration: { start_seconds: NARRATION_START, duration_seconds: 229.5, gain: 1 },
        score: { start_seconds: 0, duration_seconds: MASTER, gain: 0.22 },
        source_audio_enabled: false,
      },
      technical_qc: {
        duration_seconds: duration,
        width: Number(video.width),
        height: Number(video.height),
        video_codec: video.codec_name || null,
        frame_rate: video.r_frame_rate || null,
        audio_codec: audio.codec_name || null,
        sample_rate: Number(audio.sample_rate || 0) || null,
        channels: Number(audio.channels || 0) || null,
        av_streams_present: true,
        unit_01_width: Number(firstUnitVideo.width),
        unit_01_height: Number(firstUnitVideo.height),
        unit_12_width: Number(lastUnitVideo.width),
        unit_12_height: Number(lastUnitVideo.height),
        joined_visual_width: Number(visualStream.width),
        joined_visual_height: Number(visualStream.height),
      },
      release_review_required: true,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin
      .from("creative_projects")
      .update({ metadata: { ...metadata, spatial_investor_master_v2: next }, updated_at: new Date().toISOString() })
      .eq("id", PROJECT)
      .eq("organization_id", ORG);
    if (error) throw error;

    return {
      success: true,
      rendered: true,
      fast_stream_copy: true,
      output_path: OUTPUT_PATH,
      signed_url: await signed(OUTPUT_PATH, 86400),
      duration_seconds: duration,
      bytes: stored.bytes,
      checksum: stored.checksum,
      technical_qc: next.technical_qc,
      sound: next.sound,
      full_screen_ui_ratio: 0,
      status: next.status,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

async function status() {
  const p = await project();
  const current = p.metadata?.spatial_investor_master_v2 || {};
  const ready = await outputReady();
  return {
    success: true,
    ready,
    status: current.status || "NOT_RENDERED",
    output_path: ready ? OUTPUT_PATH : null,
    signed_url: ready ? await signed(OUTPUT_PATH, 86400) : null,
    duration_seconds: current.duration_seconds || MASTER,
    sound: current.sound || null,
    technical_qc: current.technical_qc || null,
    full_screen_ui_ratio: 0,
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
    console.error("CREATIVE_INVESTOR_SPATIAL_FAST_MASTER_FAILED", {
      message: error?.message || String(error),
      details: error?.details || null,
    });
    return json({ success: false, error: error?.message || String(error), details: error?.details || null }, 500);
  }
}
