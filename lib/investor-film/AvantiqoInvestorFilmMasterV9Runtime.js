import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveCreativeFfmpegPath,
  resolveCreativeFfprobePath,
} from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const CONTRACT = "AVANTIQO_INVESTOR_FILM_MASTER_V9_INTELLIGENCE";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const FPS = 24;
const TARGET_FRAMES = 5700;
const TARGET_DURATION = 237.5;

const V8_MICRO_ROOT = `${ORG}/${PROJECT}/spatial-master-v8-micro/chunks`;
const NARRATION = `${ORG}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3`;
const SCORE = `${ORG}/avantiqo-investor-film-20260820/audio/avantiqo-investor-score-v1-approved.mp3`;

const BUSINESS_PARTNER = `${ORG}/avantiqo-investor-film-20260821/business-partner-digital-twin-v1-922f.mp4`;
const COMMUNICATION = `${ORG}/avantiqo-investor-film-20260821/communication-intelligence-v3-911f.mp4`;
const CROSS_DOMAIN = `${ORG}/avantiqo-investor-film-20260821/cross-domain-governance-v1-1174f.mp4`;
const STUDIO_MARKETING = `${ORG}/avantiqo-investor-film-20260821/studio-marketing-cinema-v1-881f.mp4`;

const OUTPUT_PATH = `${ORG}/${PROJECT}/spatial-master-v9/avantiqo-investor-film-v9-intelligence-237.5s.mp4`;

const SEGMENTS = Object.freeze([
  { id: "v8-chunk-01", path: `${V8_MICRO_ROOT}/chunk-01.mp4`, frames: 317, role: "opening" },
  { id: "v8-chunk-02", path: `${V8_MICRO_ROOT}/chunk-02.mp4`, frames: 403, role: "problem" },
  { id: "v8-chunk-03", path: `${V8_MICRO_ROOT}/chunk-03.mp4`, frames: 373, role: "reveal" },
  { id: "v9-business-partner", path: BUSINESS_PARTNER, frames: 922, role: "business_partner_digital_twin" },
  { id: "v9-communication", path: COMMUNICATION, frames: 911, role: "communication_intelligence" },
  { id: "v9-cross-domain", path: CROSS_DOMAIN, frames: 1174, role: "cross_domain_industry_governance" },
  { id: "v9-studio-marketing", path: STUDIO_MARKETING, frames: 881, role: "creative_studio_autonomous_marketing" },
  { id: "v8-chunk-17", path: `${V8_MICRO_ROOT}/chunk-17.mp4`, frames: 190, role: "proof" },
  { id: "v8-chunk-18", path: `${V8_MICRO_ROOT}/chunk-18.mp4`, frames: 212, role: "strategy" },
  { id: "v8-chunk-19", path: `${V8_MICRO_ROOT}/chunk-19.mp4`, frames: 236, role: "founder_close" },
  { id: "v8-chunk-20", path: `${V8_MICRO_ROOT}/chunk-20.mp4`, frames: 81, role: "logo_close" },
]);

const SEGMENT_FRAMES = SEGMENTS.reduce((total, segment) => total + segment.frames, 0);
if (SEGMENT_FRAMES !== TARGET_FRAMES) {
  throw new Error(`V9_MASTER_TIMELINE_INVALID:${SEGMENT_FRAMES}`);
}

function run(command, args, timeoutMs = 420000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1" },
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        reject(new Error("INVESTOR_V9_MASTER_MEDIA_TIMEOUT"));
      }
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
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
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(directory, { search: name, limit: 10 });
  if (error) throw error;
  return (data || []).some((entry) => entry.name === name);
}

async function signed(storagePath, expires = 21600) {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expires);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error(`V9_SIGNED_URL_MISSING:${storagePath}`);
  return data.signedUrl;
}

async function probe(ffprobe, input) {
  const raw = await run(ffprobe, [
    "-v", "error",
    "-count_frames",
    "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,nb_read_frames,sample_rate,channels",
    "-of", "json",
    input,
  ], 120000);
  return JSON.parse(raw || "{}");
}

async function uploadVideo(buffer) {
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(
    OUTPUT_PATH,
    buffer,
    {
      contentType: "video/mp4",
      upsert: true,
      cacheControl: "3600",
      metadata: {
        contract: CONTRACT,
        organization_id: ORG,
        creative_project_id: PROJECT,
        exact_frames: TARGET_FRAMES,
        fps: FPS,
        duration_seconds: TARGET_DURATION,
        narration_delay_seconds: 8,
        founder_lipsync_preserved: true,
        v9_intelligence_master: true,
        checksum,
      },
    },
  );
  if (error) throw error;
  return { checksum, bytes: buffer.length };
}

async function project() {
  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("id,organization_id,metadata")
    .eq("id", PROJECT)
    .eq("organization_id", ORG)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("INVESTOR_V9_PROJECT_NOT_FOUND");
  return data;
}

async function readiness() {
  const segmentReadiness = [];
  for (const segment of SEGMENTS) {
    segmentReadiness.push({
      id: segment.id,
      role: segment.role,
      frames: segment.frames,
      path: segment.path,
      ready: await exists(segment.path),
    });
  }
  const audio = {
    narration: await exists(NARRATION),
    score: await exists(SCORE),
  };
  return {
    segments: segmentReadiness,
    audio,
    all_segments_ready: segmentReadiness.every((item) => item.ready),
    all_audio_ready: audio.narration && audio.score,
  };
}

async function renderMaster() {
  const ffmpeg = resolveCreativeFfmpegPath();
  const ffprobe = resolveCreativeFfprobePath();
  if (!ffmpeg || !ffprobe) throw new Error("INVESTOR_V9_MEDIA_BINARY_NOT_READY");

  const p = await project();
  const state = await readiness();
  const missing = state.segments.filter((item) => !item.ready).map((item) => item.id);
  if (missing.length) throw new Error(`INVESTOR_V9_SEGMENTS_NOT_READY:${missing.join(",")}`);
  if (!state.all_audio_ready) throw new Error("INVESTOR_V9_AUDIO_NOT_READY");

  const [segmentUrls, narrationUrl, scoreUrl] = await Promise.all([
    Promise.all(SEGMENTS.map((segment) => signed(segment.path))),
    signed(NARRATION),
    signed(SCORE),
  ]);

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-v9-master-"));
  const concatList = path.join(directory, "segments.txt");
  const output = path.join(directory, "avantiqo-v9-master.mp4");

  try {
    await fs.writeFile(
      concatList,
      segmentUrls
        .map((url) => `file '${String(url).replace(/'/g, "'\\''")}'`)
        .join("\n"),
      "utf8",
    );

    await run(ffmpeg, [
      "-y",
      "-protocol_whitelist", "file,http,https,tcp,tls,crypto",
      "-f", "concat",
      "-safe", "0",
      "-i", concatList,
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
      "-t", String(TARGET_DURATION),
      "-fflags", "+genpts",
      "-movflags", "+faststart",
      output,
    ], 300000);

    const media = await probe(ffprobe, output);
    const video = (media?.streams || []).find((stream) => stream.codec_type === "video");
    const audio = (media?.streams || []).find((stream) => stream.codec_type === "audio");
    const frames = Number(video?.nb_read_frames || 0);
    const duration = Number(media?.format?.duration || 0);
    const frameRate = video?.r_frame_rate || video?.avg_frame_rate || null;

    if (!video || !audio) throw new Error("INVESTOR_V9_AV_REQUIRED");
    if (Number(video.width) !== 1920 || Number(video.height) !== 1080) {
      throw new Error(`INVESTOR_V9_DIMENSIONS_INVALID:${video.width}x${video.height}`);
    }
    if (frameRate !== "24/1") throw new Error(`INVESTOR_V9_FPS_INVALID:${frameRate}`);
    if (frames !== TARGET_FRAMES) throw new Error(`INVESTOR_V9_FRAME_COUNT_INVALID:${frames}`);
    if (Math.abs(duration - TARGET_DURATION) > 0.08) {
      throw new Error(`INVESTOR_V9_DURATION_INVALID:${duration}`);
    }

    const buffer = await fs.readFile(output);
    const stored = await uploadVideo(buffer);
    const technicalQc = {
      width: Number(video.width),
      height: Number(video.height),
      frame_rate: frameRate,
      exact_frames: frames,
      duration_seconds: duration,
      video_codec: video.codec_name || null,
      audio_codec: audio.codec_name || null,
      sample_rate: Number(audio.sample_rate || 0) || null,
      channels: Number(audio.channels || 0) || null,
      av_streams_present: true,
    };

    const metadata = p.metadata || {};
    const masterState = {
      contract: CONTRACT,
      status: "RENDERED_REVIEW_REQUIRED",
      storage_path: OUTPUT_PATH,
      exact_frames: frames,
      duration_seconds: duration,
      frame_rate: frameRate,
      narration_delay_seconds: 8,
      founder_lipsync_preserved: true,
      narration_locked: true,
      score_locked: true,
      v9_chapters: [
        "BUSINESS_PARTNER_DIGITAL_TWIN",
        "COMMUNICATION_INTELLIGENCE",
        "CROSS_DOMAIN_INDUSTRY_GOVERNANCE",
        "CREATIVE_STUDIO_AUTONOMOUS_MARKETING",
      ],
      retained_v8_chunks: [1, 2, 3, 17, 18, 19, 20],
      replaced_v8_chunks: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      checksum: stored.checksum,
      bytes: stored.bytes,
      technical_qc: technicalQc,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from("creative_projects")
      .update({
        metadata: { ...metadata, spatial_investor_master_v9: masterState },
        updated_at: new Date().toISOString(),
      })
      .eq("id", PROJECT)
      .eq("organization_id", ORG);
    if (error) throw error;

    return {
      success: true,
      rendered: true,
      status: masterState.status,
      output_path: OUTPUT_PATH,
      signed_url: await signed(OUTPUT_PATH, 86400),
      checksum: stored.checksum,
      bytes: stored.bytes,
      technical_qc: technicalQc,
      timeline: SEGMENTS.map(({ id, role, frames }) => ({ id, role, frames })),
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export const AvantiqoInvestorFilmMasterV9Runtime = Object.freeze({
  CONTRACT,
  ORG,
  PROJECT,
  BUCKET,
  FPS,
  TARGET_FRAMES,
  TARGET_DURATION,
  OUTPUT_PATH,
  SEGMENTS,

  async status() {
    const p = await project();
    const ready = await readiness();
    const finalReady = await exists(OUTPUT_PATH);
    return {
      contract: CONTRACT,
      output_path: OUTPUT_PATH,
      final_ready: finalReady,
      exact_frames: TARGET_FRAMES,
      duration_seconds: TARGET_DURATION,
      timeline_valid: SEGMENT_FRAMES === TARGET_FRAMES,
      readiness: ready,
      state: p.metadata?.spatial_investor_master_v9 || null,
      signed_url: finalReady ? await signed(OUTPUT_PATH, 86400) : null,
    };
  },

  async render() {
    return renderMaster();
  },
});
