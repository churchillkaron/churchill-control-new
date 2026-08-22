export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

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

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "da38f668-11a1-4760-a8f2-6adc3effdab5";
const TOKEN = "churchill-stay-night-v5-master-20260822";
const BUCKET = "creative-assets";
const VERSION = "CHURCHILL_STAY_FOR_THE_NIGHT_V5_MASTER_R1";
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 24;
const MASTER_SECONDS = 90;
const SCORE_ASSET_ID = "4de3ecea-6c1a-4d28-a48d-ae8d246237f5";

const TIMELINE = Object.freeze([
  { key: "scene_01_the_drop", seconds: 4, mode: "cinematic" },
  { key: "scene_02_entrance_into_night", seconds: 5, mode: "cinematic" },
  { key: "scene_03_wine_universe", seconds: 7, mode: "cinematic" },
  { key: "scene_04_dinner_future_reflections", seconds: 7, mode: "portrait" },
  { key: "scene_05_steam_into_bar", seconds: 4, mode: "cinematic" },
  { key: "scene_06_ice_time_freeze", seconds: 8, mode: "cinematic" },
  { key: "scene_07_pool_activation", seconds: 6, mode: "portrait" },
  { key: "scene_08_pool_to_shuffleboard", seconds: 5, mode: "cinematic" },
  { key: "scene_09_shuffleboard_to_dart", seconds: 4, mode: "cinematic" },
  { key: "scene_10_electric_dart_flight", seconds: 7, mode: "cinematic" },
  { key: "scene_11_band_activates_churchill", seconds: 7, mode: "portrait" },
  { key: "scene_12_many_realities_same_night", seconds: 6, mode: "cinematic" },
  { key: "scene_13_frozen_night_hero", seconds: 7, mode: "cinematic" },
  { key: "scene_14_wine_loop_return", seconds: 4, mode: "cinematic" },
  { key: "scene_15_logo_epilogue", seconds: 9, mode: "logo" },
]);

function text(value) {
  return String(value ?? "").trim();
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
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
        reject(new Error("CHURCHILL_V5_MASTER_MEDIA_TIMEOUT"));
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
      if (code === 0) resolve({ stdout: out, stderr: err });
      else reject(new Error(err.slice(-16000) || `CHURCHILL_V5_MASTER_MEDIA_EXIT_${code}`));
    });
  });
}

async function project() {
  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("*")
    .eq("id", PROJECT_ID)
    .eq("organization_id", ORGANIZATION_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V5_MASTER_PROJECT_REQUIRED");
  return data;
}

async function asset(id) {
  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select("id,file_url,image_url,thumbnail_url,metadata")
    .eq("id", id)
    .eq("organization_id", ORGANIZATION_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`CHURCHILL_V5_MASTER_ASSET_REQUIRED:${id}`);
  return data;
}

function storagePathFromReference(value) {
  const reference = text(value);
  const prefix = `storage://${BUCKET}/`;
  if (reference.startsWith(prefix)) return reference.slice(prefix.length);
  const publicNeedle = `/storage/v1/object/public/${BUCKET}/`;
  const signedNeedle = `/storage/v1/object/sign/${BUCKET}/`;
  const publicIndex = reference.indexOf(publicNeedle);
  if (publicIndex >= 0) {
    return decodeURIComponent(reference.slice(publicIndex + publicNeedle.length).split("?")[0]);
  }
  const signedIndex = reference.indexOf(signedNeedle);
  if (signedIndex >= 0) {
    return decodeURIComponent(reference.slice(signedIndex + signedNeedle.length).split("?")[0]);
  }
  return null;
}

async function signedReference(value, seconds = 21600) {
  const reference = text(value);
  if (!reference) throw new Error("CHURCHILL_V5_MASTER_REFERENCE_REQUIRED");
  const storagePath = storagePathFromReference(reference);
  if (!storagePath) {
    if (/^https:\/\//i.test(reference)) return reference;
    throw new Error("CHURCHILL_V5_MASTER_REFERENCE_UNSUPPORTED");
  }
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, seconds);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("CHURCHILL_V5_MASTER_SIGNED_URL_REQUIRED");
  return data.signedUrl;
}

async function probeDuration(ffprobe, url) {
  const result = await run(
    ffprobe,
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", url],
    60000,
  );
  const duration = Number(result.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("CHURCHILL_V5_MASTER_SOURCE_DURATION_INVALID");
  }
  return duration;
}

function commonGrade() {
  return "eq=contrast=1.045:saturation=1.035:brightness=-0.012";
}

async function renderCinematic(ffmpeg, input, output, sourceSeconds, targetSeconds) {
  const ratio = targetSeconds / sourceSeconds;
  const fadeOut = Math.max(0, targetSeconds - 0.18).toFixed(3);
  const vf = [
    `fps=${FPS}`,
    `setpts=${ratio.toFixed(8)}*PTS`,
    `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase`,
    `crop=${WIDTH}:${HEIGHT}`,
    "setsar=1",
    commonGrade(),
    "fade=t=in:st=0:d=0.10",
    `fade=t=out:st=${fadeOut}:d=0.18`,
    "format=yuv420p",
  ].join(",");
  await run(ffmpeg, [
    "-y", "-i", input,
    "-t", String(targetSeconds),
    "-vf", vf,
    "-an",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "16",
    "-r", String(FPS), "-vsync", "cfr", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", output,
  ], 180000);
}

async function renderPortrait(ffmpeg, input, output, sourceSeconds, targetSeconds) {
  const ratio = targetSeconds / sourceSeconds;
  const fadeOut = Math.max(0, targetSeconds - 0.15).toFixed(3);
  const filter = [
    `[0:v]fps=${FPS},setpts=${ratio.toFixed(8)}*PTS,split=2[bgsrc][fgsrc]`,
    `[bgsrc]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},gblur=sigma=34,eq=contrast=1.045:saturation=0.88:brightness=-0.012[bg]`,
    `[fgsrc]scale=-2:1010:force_original_aspect_ratio=decrease,setsar=1,${commonGrade()}[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,fade=t=in:st=0:d=0.08,fade=t=out:st=${fadeOut}:d=0.15,format=yuv420p[out]`,
  ].join(";");
  await run(ffmpeg, [
    "-y", "-i", input,
    "-t", String(targetSeconds),
    "-filter_complex", filter,
    "-map", "[out]", "-an",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "16",
    "-r", String(FPS), "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", output,
  ], 180000);
}

async function renderLogo(ffmpeg, input, output, sourceSeconds, targetSeconds) {
  const holdSeconds = Math.max(0, targetSeconds - sourceSeconds);
  const fadeOut = Math.max(0, targetSeconds - 0.6).toFixed(3);
  const vf = [
    `fps=${FPS}`,
    `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease`,
    `pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`,
    "setsar=1",
    commonGrade(),
    ...(holdSeconds > 0 ? [`tpad=stop_mode=clone:stop_duration=${holdSeconds.toFixed(3)}`] : []),
    `fade=t=out:st=${fadeOut}:d=0.6`,
    "format=yuv420p",
  ].join(",");
  await run(ffmpeg, [
    "-y", "-i", input,
    "-t", String(targetSeconds),
    "-vf", vf,
    "-an",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "15",
    "-r", String(FPS), "-vsync", "cfr", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", output,
  ], 180000);
}

async function concatSegments(ffmpeg, segments, output) {
  const listFile = `${output}.txt`;
  await fs.writeFile(
    listFile,
    segments.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"),
    "utf8",
  );
  await run(ffmpeg, [
    "-y", "-f", "concat", "-safe", "0", "-i", listFile,
    "-c:v", "copy", "-an", "-fflags", "+genpts",
    "-t", String(MASTER_SECONDS), "-movflags", "+faststart", output,
  ], 180000);
}

async function addScore(ffmpeg, picture, scoreUrl, output) {
  await run(ffmpeg, [
    "-y",
    "-i", picture,
    "-stream_loop", "-1", "-i", scoreUrl,
    "-filter_complex",
    `[1:a]atrim=0:${MASTER_SECONDS},asetpts=PTS-STARTPTS,volume=0.72,afade=t=in:st=0:d=1.2,afade=t=out:st=87:d=3[a]`,
    "-map", "0:v:0", "-map", "[a]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "256k",
    "-t", String(MASTER_SECONDS), "-movflags", "+faststart", output,
  ], 180000);
}

async function uploadMaster(p, file) {
  const buffer = await fs.readFile(file);
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  const target = `${ORGANIZATION_ID}/${p.id}/churchill-stay-night-v5/master/${VERSION.toLowerCase()}-${checksum.slice(0, 12)}.mp4`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(target, buffer, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
    metadata: {
      organization_id: ORGANIZATION_ID,
      creative_project_id: p.id,
      version: VERSION,
      checksum,
      master_seconds: String(MASTER_SECONDS),
      visual_review_required: "true",
      publication_authorized: "false",
    },
  });
  if (error) throw error;
  return {
    output_reference: `storage://${BUCKET}/${target}`,
    checksum_sha256: checksum,
    bytes: buffer.length,
    storage_path: target,
  };
}

async function patchMaster(p, result, technical = {}) {
  const metadata = p.metadata || {};
  const next = {
    version: VERSION,
    status: "REVIEW_REQUIRED",
    ...result,
    master_seconds: MASTER_SECONDS,
    resolution: `${WIDTH}x${HEIGHT}`,
    fps: FPS,
    timeline: TIMELINE,
    technical,
    authentic_direct_use_scenes: [
      "scene_04_dinner_future_reflections",
      "scene_07_pool_activation",
      "scene_11_band_activates_churchill",
      "scene_15_logo_epilogue",
    ],
    zero_generation_editorial_scenes: ["scene_14_wine_loop_return"],
    visual_review_complete: false,
    approved_for_master: false,
    publication_authorized: false,
    rendered_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from("creative_projects")
    .update({
      metadata: { ...metadata, churchill_v5_master: next },
      updated_at: new Date().toISOString(),
    })
    .eq("id", PROJECT_ID)
    .eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;
  return next;
}

async function render() {
  const p = await project();
  const scenes = p.metadata?.churchill_v5_scenes?.scenes || {};
  const missing = TIMELINE.filter(({ key }) => scenes[key]?.status !== "COMPLETED" || !scenes[key]?.output_reference);
  if (missing.length) {
    throw new Error(`CHURCHILL_V5_MASTER_SCENES_NOT_READY:${missing.map((item) => item.key).join(",")}`);
  }

  const ffmpeg = resolveCreativeFfmpegPath();
  const ffprobe = resolveCreativeFfprobePath();
  if (!ffmpeg || !ffprobe) throw new Error("CHURCHILL_V5_MASTER_MEDIA_BINARIES_REQUIRED");

  const score = await asset(SCORE_ASSET_ID);
  const scoreUrl = await signedReference(score.file_url || score.image_url || score.thumbnail_url);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "churchill-v5-master-"));

  try {
    const segments = [];
    const technical = {};
    for (let index = 0; index < TIMELINE.length; index += 1) {
      const beat = TIMELINE[index];
      const state = scenes[beat.key];
      const url = await signedReference(state.output_reference);
      const sourceSeconds = await probeDuration(ffprobe, url);
      const output = path.join(directory, `${String(index + 1).padStart(2, "0")}-${beat.key}.mp4`);
      if (beat.mode === "portrait") {
        await renderPortrait(ffmpeg, url, output, sourceSeconds, beat.seconds);
      } else if (beat.mode === "logo") {
        await renderLogo(ffmpeg, url, output, sourceSeconds, beat.seconds);
      } else {
        await renderCinematic(ffmpeg, url, output, sourceSeconds, beat.seconds);
      }
      segments.push(output);
      technical[beat.key] = {
        source_seconds: Number(sourceSeconds.toFixed(3)),
        timeline_seconds: beat.seconds,
        mode: beat.mode,
        source_type: state.source_type || (state.generated_plate_only ? "GENERATED_VFX_PLATE" : "EXISTING_MEDIA"),
      };
    }

    const silent = path.join(directory, "churchill-v5-silent.mp4");
    const master = path.join(directory, "churchill-v5-review-master.mp4");
    await concatSegments(ffmpeg, segments, silent);
    await addScore(ffmpeg, silent, scoreUrl, master);
    const result = await uploadMaster(p, master);
    await patchMaster(p, result, technical);
    return {
      success: true,
      version: VERSION,
      status: "REVIEW_REQUIRED",
      ...result,
      master_seconds: MASTER_SECONDS,
      resolution: `${WIDTH}x${HEIGHT}`,
      fps: FPS,
      scene_count: TIMELINE.length,
      visual_review_complete: false,
      publication_authorized: false,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

async function status() {
  const p = await project();
  const scenes = p.metadata?.churchill_v5_scenes?.scenes || {};
  return {
    success: true,
    version: VERSION,
    master: p.metadata?.churchill_v5_master || null,
    timeline: TIMELINE.map((beat) => ({
      ...beat,
      status: scenes[beat.key]?.status || "MISSING",
      visual_review_complete: scenes[beat.key]?.visual_review_complete === true,
      approved_for_master: scenes[beat.key]?.approved_for_master === true,
    })),
    policy: {
      story_locked: true,
      authentic_churchill_required: true,
      generated_replacement_for_direct_scenes_allowed: false,
      visual_review_required: true,
      publication_authorized: false,
    },
  };
}

async function video() {
  const p = await project();
  const ref = text(p.metadata?.churchill_v5_master?.output_reference);
  if (!ref) return json({ success: false, error: "CHURCHILL_V5_MASTER_NOT_RENDERED" }, 409);
  const storagePath = storagePathFromReference(ref);
  if (!storagePath) throw new Error("CHURCHILL_V5_MASTER_STORAGE_REFERENCE_INVALID");
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  return new Response(await data.arrayBuffer(), {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": 'inline; filename="churchill-stay-for-the-night-v5-review-master.mp4"',
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    if (action === "status") return json(await status());
    if (action === "render") return json(await render());
    if (action === "video") return await video();
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("CHURCHILL_V5_MASTER_FAILED", {
      message: error?.message || String(error),
      details: error?.details || null,
    });
    return json({ success: false, error: error?.message || String(error), details: error?.details || null }, 500);
  }
}
