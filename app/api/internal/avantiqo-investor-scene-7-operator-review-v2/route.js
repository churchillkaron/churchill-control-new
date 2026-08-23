export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const TOKEN = "avq-investor-scene-7-operator-review-v2-20260823";
const CONTRACT = "AVANTIQO_INVESTOR_SCENE_7_OPERATOR_REVIEW_V2";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const W = 1920;
const H = 1080;
const FPS = 24;
const DURATION = 8.4375;
const NARRATION_START = 19.8285;
const NARRATION = "Whenever I wanted to understand what was really happening, I had to put the company back together in my head.";

const SOURCE = `${ORG}/unassigned/61b4afe1-93ae-4e1e-a92f-60dff5d629be-avantiqo-investor-manager-ee25292e-4fd3-4249-81cb-3ab526fd2048.mp4`;
const SOURCE_ASSET_ID = "57f2aee6-6950-43e6-b4f6-9940905ded12";
const VOICE = `${ORG}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3`;
const SCORE = `${ORG}/avantiqo-investor-film-20260820/audio/avantiqo-investor-score-v1-approved.mp3`;
const OUTPUT = `${ORG}/${PROJECT}/scene-previews-20260823/scene-07-operator-integration-review-v2.mp4`;

const supabase = getServiceSupabase();

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

function run(command, args, timeoutMs = 285000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, OMP_NUM_THREADS: "1" } });
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) { settled = true; reject(new Error("SCENE_7_V2_REVIEW_TIMEOUT")); }
    }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) { settled = true; reject(error); }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code !== 0) reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-16000) || `MEDIA_EXIT_${code}`));
      else resolve(true);
    });
  });
}

async function download(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`SCENE_7_V2_SOURCE_EMPTY:${storagePath}`);
  await fs.writeFile(localPath, Buffer.from(await data.arrayBuffer()));
}

async function exists(storagePath) {
  const directory = path.posix.dirname(storagePath);
  const filename = path.posix.basename(storagePath);
  const { data, error } = await supabase.storage.from(BUCKET).list(directory, { search: filename, limit: 10 });
  if (error) return false;
  return (data || []).some((row) => row.name === filename);
}

async function signedUrl(storagePath, seconds = 86400) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function upload(localPath) {
  const bytes = await fs.readFile(localPath);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const { error } = await supabase.storage.from(BUCKET).upload(OUTPUT, bytes, {
    contentType: "video/mp4",
    cacheControl: "3600",
    upsert: true,
    metadata: {
      contract: CONTRACT,
      organization_id: ORG,
      creative_project_id: PROJECT,
      scene: "7",
      role: "OPERATOR_IS_THE_INTEGRATION_LAYER",
      narration: NARRATION,
      duration_seconds: String(DURATION),
      source: SOURCE,
      source_asset_id: SOURCE_ASSET_ID,
      source_analysis_status: "VERIFIED",
      source_approval_status: "APPROVED",
      narration_source_start_seconds: String(NARRATION_START),
      real_footage_only: "true",
      overlays_present: "false",
      fake_ui_present: "false",
      image_generation_used: "false",
      churchill_present: "false",
      publication_authorized: "false",
      sha256,
    },
  });
  if (error) throw error;
  return { bytes: bytes.length, sha256 };
}

async function render() {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_EDITOR_NOT_READY");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-scene7-v2-"));
  try {
    const source = path.join(directory, "manager.mp4");
    const voice = path.join(directory, "voice.mp3");
    const score = path.join(directory, "score.mp3");
    const final = path.join(directory, "scene7-v2.mp4");
    await Promise.all([download(SOURCE, source), download(VOICE, voice), download(SCORE, score)]);
    await run(ffmpeg, [
      "-y", "-stream_loop", "-1", "-ss", "1.0", "-i", source, "-i", voice, "-i", score,
      "-t", String(DURATION),
      "-filter_complex",
      `[0:v]scale=1960:1103:force_original_aspect_ratio=increase,crop=${W}:${H}:x='(iw-ow)/2+3*sin(t*0.22)':y='(ih-oh)/2+2*sin(t*0.17)',fps=${FPS},eq=contrast=1.035:brightness=-0.010:saturation=0.91,format=yuv420p[v];` +
      `[1:a]atrim=start=${NARRATION_START}:duration=${DURATION},asetpts=PTS-STARTPTS,volume=1.03[voice];` +
      `[2:a]atrim=start=${NARRATION_START}:duration=${DURATION},asetpts=PTS-STARTPTS,volume=0.105[score];` +
      `[voice][score]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95,atrim=duration=${DURATION}[a]`,
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "fast", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(FPS),
      "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", final,
    ]);
    const stored = await upload(final);
    return { success: true, contract: CONTRACT, scene: 7, role: "OPERATOR_IS_THE_INTEGRATION_LAYER", duration_seconds: DURATION, narration: NARRATION, output_ready: true, output_path: OUTPUT, signed_url: await signedUrl(OUTPUT), source_quality: { asset_id: SOURCE_ASSET_ID, analysis_status: "VERIFIED", approval_status: "APPROVED" }, rules: { real_footage_only: true, overlays_present: false, fake_ui_present: false, image_generation_used: false, churchill_present: false }, ...stored };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = String(url.searchParams.get("action") || "status").trim().toLowerCase();
    if (action === "render") return json(await render());
    const ready = await exists(OUTPUT);
    if (action === "signed") return json({ success: true, output_ready: ready, output_path: OUTPUT, signed_url: ready ? await signedUrl(OUTPUT) : null });
    if (action === "status") return json({ success: true, contract: CONTRACT, scene: 7, output_ready: ready, output_path: OUTPUT, source_quality: { asset_id: SOURCE_ASSET_ID, analysis_status: "VERIFIED", approval_status: "APPROVED" } });
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, contract: CONTRACT, error: error?.message || String(error) }, 500);
  }
}
