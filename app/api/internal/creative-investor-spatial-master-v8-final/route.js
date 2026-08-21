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

const TOKEN = "avq-investor-spatial-master-v8-20260821";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const CONTRACT = "AVANTIQO_INVESTOR_FILM_MASTER_V8_OBSIDIAN_MICROCHUNK";
const FPS = 24;
const MASTER_SECONDS = 237.5;
const MICRO_ROOT = `${ORG}/${PROJECT}/spatial-master-v8-micro`;
const FINAL_PATH = `${ORG}/${PROJECT}/spatial-master-v8/avantiqo-investor-film-v8-obsidian-237.5s.mp4`;
const NARRATION = `${ORG}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3`;
const SCORE = `${ORG}/avantiqo-investor-film-20260820/audio/avantiqo-investor-score-v1-approved.mp3`;
const CHUNK_COUNT = 20;

const chunkPath = (index) => `${MICRO_ROOT}/chunks/chunk-${String(index).padStart(2, "0")}.mp4`;
const json = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });

function run(command, args, timeoutMs = 420000) {
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
        reject(new Error("INVESTOR_V8_FINAL_MEDIA_TIMEOUT"));
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
  if (!data) throw new Error("INVESTOR_V8_PROJECT_NOT_FOUND");
  return data;
}

async function signed(storagePath, expires = 21600) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, expires);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error(`INVESTOR_V8_SIGNED_URL_MISSING:${storagePath}`);
  return data.signedUrl;
}

async function exists(storagePath) {
  const dir = storagePath.slice(0, storagePath.lastIndexOf("/"));
  const name = storagePath.slice(storagePath.lastIndexOf("/") + 1);
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(dir, { search: name, limit: 10 });
  if (error) throw error;
  return (data || []).some((entry) => entry.name === name);
}

async function probe(ffprobe, input) {
  return new Promise((resolve, reject) => {
    const stdout = [];
    const stderr = [];
    const child = spawn(ffprobe, [
      "-v", "error",
      "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,sample_rate,channels",
      "-of", "json",
      input,
    ], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(Buffer.concat(stderr).toString("utf8") || `FFPROBE_EXIT_${code}`));
      try { resolve(JSON.parse(Buffer.concat(stdout).toString("utf8"))); }
      catch (error) { reject(error); }
    });
  });
}

async function uploadVideo(buffer, storagePath, metadata = {}) {
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
    metadata: { organization_id: ORG, creative_project_id: PROJECT, contract: CONTRACT, checksum, ...metadata },
  });
  if (error) throw error;
  return { checksum, bytes: buffer.length };
}

async function renderFinal() {
  const ffmpeg = resolveCreativeFfmpegPath();
  const ffprobe = resolveCreativeFfprobePath();
  if (!ffmpeg || !ffprobe) throw new Error("INVESTOR_V8_MEDIA_BINARY_NOT_READY");

  const p = await project();
  for (let index = 1; index <= CHUNK_COUNT; index += 1) {
    if (!(await exists(chunkPath(index)))) throw new Error(`INVESTOR_V8_CHUNK_NOT_READY:${index}`);
  }
  if (!(await exists(NARRATION)) || !(await exists(SCORE))) throw new Error("INVESTOR_V8_AUDIO_SOURCE_MISSING");

  const [chunkUrls, narrationUrl, scoreUrl] = await Promise.all([
    Promise.all(Array.from({ length: CHUNK_COUNT }, (_, i) => signed(chunkPath(i + 1)))),
    signed(NARRATION),
    signed(SCORE),
  ]);

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-v8-final-stream-"));
  const list = path.join(directory, "chunks.txt");
  const output = path.join(directory, "master.mp4");

  try {
    await fs.writeFile(
      list,
      chunkUrls.map((url) => `file '${String(url).replace(/'/g, "'\\''")}'`).join("\n"),
      "utf8",
    );

    await run(ffmpeg, [
      "-y",
      "-protocol_whitelist", "file,http,https,tcp,tls,crypto",
      "-f", "concat",
      "-safe", "0",
      "-i", list,
      "-i", narrationUrl,
      "-stream_loop", "-1",
      "-i", scoreUrl,
      "-filter_complex",
      "[1:a]atrim=0:229.5,asetpts=PTS-STARTPTS,adelay=8000:all=1,aresample=48000,volume=1[voice];[2:a]atrim=0:237.5,asetpts=PTS-STARTPTS,aresample=48000,volume=.22,afade=t=in:st=0:d=2.5,afade=t=out:st=233.5:d=4[score];[voice][score]amix=inputs=2:duration=longest:dropout_transition=0,alimiter=limit=.95[aout]",
      "-map", "0:v:0",
      "-map", "[aout]",
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "256k",
      "-ar", "48000",
      "-ac", "2",
      "-t", "237.5",
      "-fflags", "+genpts",
      "-movflags", "+faststart",
      output,
    ], 240000);

    const media = await probe(ffprobe, output);
    const duration = Number(media?.format?.duration || 0);
    const video = (media?.streams || []).find((stream) => stream.codec_type === "video");
    const audio = (media?.streams || []).find((stream) => stream.codec_type === "audio");
    if (!video || !audio) throw new Error("INVESTOR_V8_AV_REQUIRED");
    if (Number(video.width) !== 1920 || Number(video.height) !== 1080) throw new Error("INVESTOR_V8_DIMENSIONS_INVALID");
    if ((video.r_frame_rate || video.avg_frame_rate) !== "24/1") throw new Error(`INVESTOR_V8_FPS_INVALID:${video.r_frame_rate || video.avg_frame_rate}`);
    if (Math.abs(duration - MASTER_SECONDS) > 0.25) throw new Error(`INVESTOR_V8_DURATION_INVALID:${duration}`);

    const bytes = await fs.readFile(output);
    const stored = await uploadVideo(bytes, FINAL_PATH, {
      final_master: true,
      direct_stream_concat: true,
      microchunk_transport: true,
      cfr_24fps: true,
      semantic_sync: true,
      subject_safe_overlays: true,
      founder_visible_speaking: true,
      targeted_lipsync_repair: true,
      whole_scene_fade_to_black: false,
      narration_delay_seconds: 8,
      visual_profile: "obsidian_v8",
      authentic_screen_capture_used: false,
      generated_replacement_footage_used: false,
    });

    const technical_qc = {
      width: Number(video.width),
      height: Number(video.height),
      video_codec: video.codec_name || null,
      audio_codec: audio.codec_name || null,
      sample_rate: Number(audio.sample_rate || 0) || null,
      channels: Number(audio.channels || 0) || null,
      duration_seconds: duration,
      av_streams_present: true,
    };
    const next = {
      contract: CONTRACT,
      status: "RENDERED_REVIEW_REQUIRED",
      storage_path: FINAL_PATH,
      duration_seconds: duration,
      logo_seconds: 8,
      narration_seconds: 229.5,
      frame_rate: video.r_frame_rate || video.avg_frame_rate,
      semantic_visual_sync: true,
      subject_safe_overlays: true,
      whole_scene_fade_to_black: false,
      founder_visible_speaking: true,
      targeted_lipsync_repair: true,
      opening_visible_lipsync_max_seconds: 5.208333333,
      microchunk_count: CHUNK_COUNT,
      visual_profile: "obsidian_v8",
      authentic_screen_capture_used: false,
      generated_replacement_footage_used: false,
      direct_stream_concat: true,
      checksum: stored.checksum,
      bytes: stored.bytes,
      technical_qc,
      updated_at: new Date().toISOString(),
    };

    const metadata = p.metadata || {};
    const { error } = await supabaseAdmin
      .from("creative_projects")
      .update({ metadata: { ...metadata, spatial_investor_master_v8: next }, updated_at: new Date().toISOString() })
      .eq("id", PROJECT)
      .eq("organization_id", ORG);
    if (error) throw error;

    return {
      success: true,
      rendered: true,
      status: next.status,
      output_path: FINAL_PATH,
      signed_url: await signed(FINAL_PATH, 86400),
      duration_seconds: duration,
      visual_profile: "obsidian_v8",
      authentic_screen_capture_used: false,
      generated_replacement_footage_used: false,
      semantic_visual_sync: true,
      technical_qc,
      checksum: stored.checksum,
      bytes: stored.bytes,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

async function status() {
  const p = await project();
  const state = p.metadata?.spatial_investor_master_v8 || {};
  const finalReady = await exists(FINAL_PATH);
  return {
    success: true,
    contract: CONTRACT,
    final_ready: finalReady,
    state,
    chunk_count: CHUNK_COUNT,
    all_chunks_ready: await Promise.all(Array.from({ length: CHUNK_COUNT }, (_, i) => exists(chunkPath(i + 1)))).then((rows) => rows.every(Boolean)),
    policies: {
      visual_profile: "obsidian_v8",
      authentic_screen_capture_used: false,
      generated_replacement_footage_used: false,
    },
    signed_url: finalReady ? await signed(FINAL_PATH, 86400) : null,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = String(url.searchParams.get("action") || "status").toLowerCase();
    if (action === "status") return json(await status());
    if (action === "render-final") return json(await renderFinal());
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("CREATIVE_INVESTOR_SPATIAL_MASTER_V8_FINAL_FAILED", { message: error?.message || String(error) });
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
