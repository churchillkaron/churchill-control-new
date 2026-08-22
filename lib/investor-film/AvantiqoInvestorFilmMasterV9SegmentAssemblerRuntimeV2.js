import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath, resolveCreativeFfprobePath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const CONTRACT = "AVANTIQO_INVESTOR_FILM_MASTER_V9_INTELLIGENCE_EXACT";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const FPS = 24;
const TARGET_FRAMES = 5700;
const TARGET_DURATION = 237.5;
const V8_MICRO_ROOT = `${ORG}/${PROJECT}/spatial-master-v8-micro/chunks`;
const NARRATION = `${ORG}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3`;
const SCORE = `${ORG}/avantiqo-investor-film-20260820/audio/avantiqo-investor-score-v1-approved.mp3`;
const OUTPUT_PATH = `${ORG}/${PROJECT}/spatial-master-v9/avantiqo-investor-film-v9-intelligence-237.5s.mp4`;
const FILTER_THREAD_ARGS = ["-filter_threads", "1", "-filter_complex_threads", "1"];
const X264_PARAMS = "threads=1:lookahead_threads=0:sync-lookahead=0:rc-lookahead=0:bframes=0";

const SEGMENTS = Object.freeze([
  { id: "v8-chunk-01", path: `${V8_MICRO_ROOT}/chunk-01.mp4`, frames: 317, role: "opening" },
  { id: "v8-chunk-02", path: `${V8_MICRO_ROOT}/chunk-02.mp4`, frames: 403, role: "problem" },
  { id: "v8-chunk-03", path: `${V8_MICRO_ROOT}/chunk-03.mp4`, frames: 373, role: "reveal" },
  { id: "v9-business-partner", path: `${ORG}/avantiqo-investor-film-20260821/business-partner-digital-twin-v1-922f.mp4`, frames: 922, role: "business_partner_digital_twin" },
  { id: "v9-communication", path: `${ORG}/avantiqo-investor-film-20260821/communication-intelligence-v3-911f.mp4`, frames: 911, role: "communication_intelligence" },
  { id: "v9-cross-domain", path: `${ORG}/avantiqo-investor-film-20260821/cross-domain-governance-v1-1174f.mp4`, frames: 1174, role: "cross_domain_industry_governance" },
  { id: "v9-studio-marketing", path: `${ORG}/avantiqo-investor-film-20260821/studio-marketing-cinema-v1-881f.mp4`, frames: 881, role: "creative_studio_autonomous_marketing" },
  { id: "v8-chunk-17", path: `${V8_MICRO_ROOT}/chunk-17.mp4`, frames: 190, role: "proof" },
  { id: "v8-chunk-18", path: `${V8_MICRO_ROOT}/chunk-18.mp4`, frames: 212, role: "strategy" },
  { id: "v8-chunk-19", path: `${V8_MICRO_ROOT}/chunk-19.mp4`, frames: 236, role: "founder_close" },
  { id: "v8-chunk-20", path: `${V8_MICRO_ROOT}/chunk-20.mp4`, frames: 81, role: "logo_close" },
]);

const SEGMENT_FRAMES = SEGMENTS.reduce((sum, segment) => sum + segment.frames, 0);
if (SEGMENT_FRAMES !== TARGET_FRAMES) throw new Error(`V9_MASTER_TIMELINE_INVALID:${SEGMENT_FRAMES}`);

function run(command, args, timeoutMs = 700000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1", MKL_NUM_THREADS: "1" },
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) { settled = true; reject(new Error("INVESTOR_V9_MASTER_MEDIA_TIMEOUT")); }
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) { settled = true; reject(error); }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) reject(new Error(err.slice(-16000) || `MEDIA_EXIT_${code}`));
      else resolve(out);
    });
  });
}

async function exists(storagePath) {
  const directory = storagePath.slice(0, storagePath.lastIndexOf("/"));
  const name = storagePath.slice(storagePath.lastIndexOf("/") + 1);
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(directory, { search: name, limit: 10 });
  if (error) throw error;
  return (data || []).some((entry) => entry.name === name);
}

async function signed(storagePath, expires = 21600) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, expires);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error(`V9_SIGNED_URL_MISSING:${storagePath}`);
  return data.signedUrl;
}

async function probe(ffprobe, input, timeoutMs = 120000) {
  const raw = await run(ffprobe, [
    "-v", "error", "-count_frames",
    "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,nb_read_frames,sample_rate,channels",
    "-of", "json", input,
  ], timeoutMs);
  return JSON.parse(raw || "{}");
}

async function project() {
  const { data, error } = await supabaseAdmin.from("creative_projects").select("id,organization_id,metadata").eq("id", PROJECT).eq("organization_id", ORG).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("INVESTOR_V9_PROJECT_NOT_FOUND");
  return data;
}

async function readiness() {
  const segments = [];
  for (const segment of SEGMENTS) segments.push({ ...segment, ready: await exists(segment.path) });
  const audio = { narration: await exists(NARRATION), score: await exists(SCORE) };
  return { segments, audio, all_segments_ready: segments.every((item) => item.ready), all_audio_ready: audio.narration && audio.score };
}

async function sha256File(localPath) {
  const hash = crypto.createHash("sha256");
  const stream = createReadStream(localPath, { highWaterMark: 1024 * 1024 });
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

function requireServerEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`INVESTOR_V9_ENV_MISSING:${name}`);
  return value;
}

async function uploadVideo(localPath) {
  const stat = await fs.stat(localPath);
  const checksum = await sha256File(localPath);
  const supabaseUrl = requireServerEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
  const serviceRole = requireServerEnv("SUPABASE_SERVICE_ROLE_KEY");
  const encodedPath = OUTPUT_PATH.split("/").map((part) => encodeURIComponent(part)).join("/");
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${encodeURIComponent(BUCKET)}/${encodedPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRole}`,
      apikey: serviceRole,
      "Content-Type": "video/mp4",
      "Content-Length": String(stat.size),
      "Cache-Control": "max-age=3600",
      "x-upsert": "true",
    },
    body: createReadStream(localPath, { highWaterMark: 1024 * 1024 }),
    duplex: "half",
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`INVESTOR_V9_STORAGE_UPLOAD_FAILED:${response.status}:${detail.slice(0, 1000)}`);
  }
  return { checksum, bytes: stat.size };
}

async function normalizeSegment({ ffmpeg, ffprobe, segment, sourceUrl, directory, index }) {
  const output = path.join(directory, `normalized-${String(index + 1).padStart(2, "0")}.mp4`);
  await run(ffmpeg, [
    "-y", "-threads", "1", ...FILTER_THREAD_ARGS,
    "-i", sourceUrl,
    "-map", "0:v:0", "-an",
    "-vf", `fps=${FPS},tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${segment.frames},setpts=N/(${FPS}*TB)`,
    "-c:v", "libx264", "-threads", "1", "-x264-params", X264_PARAMS,
    "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-frames:v", String(segment.frames), "-movflags", "+faststart", output,
  ], 420000);

  const media = await probe(ffprobe, output, 90000);
  const video = (media?.streams || []).find((stream) => stream.codec_type === "video");
  const frames = Number(video?.nb_read_frames || 0);
  const frameRate = video?.r_frame_rate || video?.avg_frame_rate || null;
  if (!video) throw new Error(`INVESTOR_V9_NORMALIZED_VIDEO_MISSING:${segment.id}`);
  if (frames !== segment.frames) throw new Error(`INVESTOR_V9_NORMALIZED_FRAME_COUNT_INVALID:${segment.id}:${frames}/${segment.frames}`);
  if (frameRate !== "24/1") throw new Error(`INVESTOR_V9_NORMALIZED_FPS_INVALID:${segment.id}:${frameRate}`);
  if (Number(video.width) !== 1920 || Number(video.height) !== 1080) throw new Error(`INVESTOR_V9_NORMALIZED_DIMENSIONS_INVALID:${segment.id}:${video.width}x${video.height}`);
  return { output, frames, frame_rate: frameRate };
}

async function renderMaster() {
  const ffmpeg = resolveCreativeFfmpegPath();
  const ffprobe = resolveCreativeFfprobePath();
  if (!ffmpeg || !ffprobe) throw new Error("INVESTOR_V9_MEDIA_BINARY_NOT_READY");

  const p = await project();
  const ready = await readiness();
  const missing = ready.segments.filter((item) => !item.ready).map((item) => item.id);
  if (missing.length) throw new Error(`INVESTOR_V9_SEGMENTS_NOT_READY:${missing.join(",")}`);
  if (!ready.all_audio_ready) throw new Error("INVESTOR_V9_AUDIO_NOT_READY");

  const [segmentUrls, narrationUrl, scoreUrl] = await Promise.all([
    Promise.all(SEGMENTS.map((segment) => signed(segment.path))),
    signed(NARRATION),
    signed(SCORE),
  ]);

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-v9-segment-assembler-"));
  const concatList = path.join(directory, "segments.txt");
  const joined = path.join(directory, "joined.mp4");
  const output = path.join(directory, "master.mp4");

  try {
    const normalized = [];
    for (let index = 0; index < SEGMENTS.length; index += 1) {
      normalized.push(await normalizeSegment({
        ffmpeg, ffprobe, segment: SEGMENTS[index], sourceUrl: segmentUrls[index], directory, index,
      }));
    }

    await fs.writeFile(concatList, normalized.map((item) => `file '${String(item.output).replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
    await run(ffmpeg, [
      "-y", "-threads", "1", "-f", "concat", "-safe", "0", "-i", concatList,
      "-map", "0:v:0", "-an", "-c:v", "copy", "-fflags", "+genpts", "-movflags", "+faststart", joined,
    ], 180000);

    const joinedMedia = await probe(ffprobe, joined, 120000);
    const joinedVideo = (joinedMedia?.streams || []).find((stream) => stream.codec_type === "video");
    const joinedFrames = Number(joinedVideo?.nb_read_frames || 0);
    if (joinedFrames !== TARGET_FRAMES) throw new Error(`INVESTOR_V9_JOINED_FRAME_COUNT_INVALID:${joinedFrames}`);

    await run(ffmpeg, [
      "-y", "-threads", "1", ...FILTER_THREAD_ARGS,
      "-i", joined, "-i", narrationUrl, "-stream_loop", "-1", "-i", scoreUrl,
      "-filter_complex",
      `[1:a]atrim=0:229.5,asetpts=PTS-STARTPTS,adelay=8000:all=1,aresample=48000,volume=1[voice];[2:a]atrim=0:237.5,asetpts=PTS-STARTPTS,aresample=48000,volume=.22,afade=t=in:st=0:d=2.5,afade=t=out:st=233.5:d=4[score];[voice][score]amix=inputs=2:duration=longest:dropout_transition=0,alimiter=limit=.95[aout]`,
      "-map", "0:v:0", "-map", "[aout]",
      "-c:v", "copy",
      "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2",
      "-frames:v", String(TARGET_FRAMES), "-t", String(TARGET_DURATION), "-movflags", "+faststart", output,
    ], 240000);

    const media = await probe(ffprobe, output, 180000);
    const video = (media?.streams || []).find((stream) => stream.codec_type === "video");
    const audio = (media?.streams || []).find((stream) => stream.codec_type === "audio");
    const frames = Number(video?.nb_read_frames || 0);
    const duration = Number(media?.format?.duration || 0);
    const frameRate = video?.r_frame_rate || video?.avg_frame_rate || null;

    if (!video || !audio) throw new Error("INVESTOR_V9_AV_REQUIRED");
    if (Number(video.width) !== 1920 || Number(video.height) !== 1080) throw new Error(`INVESTOR_V9_DIMENSIONS_INVALID:${video.width}x${video.height}`);
    if (frameRate !== "24/1") throw new Error(`INVESTOR_V9_FPS_INVALID:${frameRate}`);
    if (frames !== TARGET_FRAMES) throw new Error(`INVESTOR_V9_FRAME_COUNT_INVALID:${frames}`);
    if (Math.abs(duration - TARGET_DURATION) > 0.08) throw new Error(`INVESTOR_V9_DURATION_INVALID:${duration}`);

    const stored = await uploadVideo(output);
    const technical_qc = {
      width: Number(video.width), height: Number(video.height), frame_rate: frameRate, exact_frames: frames,
      duration_seconds: duration, video_codec: video.codec_name || null, audio_codec: audio.codec_name || null,
      sample_rate: Number(audio.sample_rate || 0) || null, channels: Number(audio.channels || 0) || null,
      av_streams_present: true, exact_frame_normalized: true, low_memory_render: true,
      segment_normalized: true, normalized_segment_count: normalized.length, final_video_stream_copy: true,
    };
    const masterState = {
      contract: CONTRACT, status: "RENDERED_REVIEW_REQUIRED", storage_path: OUTPUT_PATH, exact_frames: frames,
      duration_seconds: duration, frame_rate: frameRate, narration_delay_seconds: 8, narration_locked: true,
      score_locked: true, exact_frame_normalized: true, segment_normalized: true, normalized_segment_count: normalized.length,
      final_video_stream_copy: true, checksum: stored.checksum, bytes: stored.bytes, technical_qc,
      low_memory_render: true, updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin.from("creative_projects").update({
      metadata: { ...(p.metadata || {}), spatial_investor_master_v9: masterState }, updated_at: new Date().toISOString(),
    }).eq("id", PROJECT).eq("organization_id", ORG);
    if (error) throw error;

    return {
      success: true, rendered: true, status: masterState.status, output_path: OUTPUT_PATH,
      signed_url: await signed(OUTPUT_PATH, 86400), checksum: stored.checksum, bytes: stored.bytes,
      technical_qc, timeline: SEGMENTS.map(({ id, role, frames: segmentFrames }) => ({ id, role, frames: segmentFrames })),
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export const AvantiqoInvestorFilmMasterV9SegmentAssemblerRuntimeV2 = Object.freeze({
  CONTRACT, ORG, PROJECT, BUCKET, FPS, TARGET_FRAMES, TARGET_DURATION, OUTPUT_PATH, SEGMENTS,
  async status() {
    const p = await project();
    const ready = await readiness();
    const finalReady = await exists(OUTPUT_PATH);
    return {
      contract: CONTRACT, assembler: "SEGMENT_NORMALIZED_STREAM_COPY_V2", output_path: OUTPUT_PATH,
      final_ready: finalReady, exact_frames: TARGET_FRAMES, duration_seconds: TARGET_DURATION,
      timeline_valid: SEGMENT_FRAMES === TARGET_FRAMES, readiness: ready,
      state: p.metadata?.spatial_investor_master_v9 || null,
      signed_url: finalReady ? await signed(OUTPUT_PATH, 86400) : null,
    };
  },
  async render() { return renderMaster(); },
});
