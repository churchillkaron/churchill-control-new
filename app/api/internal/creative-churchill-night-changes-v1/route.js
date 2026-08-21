export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { CreativeMissionRuntime } from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import {
  resolveCreativeFfmpegPath,
  resolveCreativeFfprobePath,
} from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const TOKEN = "churchill-night-changes-v1-20260821";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const COMMAND_IDENTITY = "CHURCHILL_90S_NIGHT_CHANGES_AUTHENTIC_MASTER_V1";
const BUCKET = "creative-assets";
const MASTER_SECONDS = 90;
const FPS = 24;
const WIDTH = 1920;
const HEIGHT = 1080;

const SOURCE = Object.freeze({
  logo_motion: "861dd782-483d-4f1d-b785-0be1d6773bec",
  logo_3d: "f2e57100-1b78-43c7-86d9-2cc31c17b47a",
  entrance: "f0c96f1a-6719-4dc2-8b9a-d095864d273a",
  dinner: "8b4854e6-8c9c-4fc6-a3f5-7eaadc1d8d8b",
  food: "e767ad1c-e9ba-4bc3-aebc-525e963a8c78",
  pool_video: "d10ddc3a-386f-403b-9bb4-2cfe40c7c655",
  pool_still: "797c9d16-5465-4e60-be93-a6c65707f7db",
  shuffleboard: "23756544-16cd-4d76-9e26-2e11bdde8c23",
  cole_identity: "370a3030-8656-4b28-934f-6653d5eaf3c8",
  stage_video: "dcd86649-42f8-4f7a-be91-00c456eb940d",
  score: "4de3ecea-6c1a-4d28-a48d-ae8d246237f5",
});

const AUTHENTICITY = Object.freeze({
  contract: "CREATIVE_AUTHENTIC_VENUE_FILM_V1",
  venue: "Churchill Bar & Restaurant, Karon, Phuket",
  exact_duration_seconds: MASTER_SECONDS,
  identity_lock: {
    singer_asset_id: SOURCE.cole_identity,
    instruction: "Cole Ley identity must be preserved from the real source. Never replace the singer with a generic generated performer.",
  },
  brand_lock: {
    logo_asset_id: SOURCE.logo_3d,
    logo_motion_asset_id: SOURCE.logo_motion,
    instruction: "Use the real Churchill CC / CHURCHILL BAR & RESTAURANT identity. Never invent or redraw the logo wording.",
  },
  venue_lock: {
    instruction: "Venue, pool, shuffleboard, bar, dinner and stage must come from Churchill source assets. Generated venue substitutes are forbidden in the authenticity master.",
  },
  games_lock: {
    pool_asset_id: SOURCE.pool_video,
    shuffleboard_asset_id: SOURCE.shuffleboard,
    instruction: "Do not fabricate a generic darts room. Only show games proven by Churchill source media; electric darts may appear when visible in the authentic venue source.",
  },
  color_policy: "Natural premium documentary grade. Warm Churchill ambience; no synthetic neon redesign and no fake luxury rebuild.",
  face_policy: "No face regeneration in the authenticity master.",
  publication_authorized: false,
});

const SEGMENTS = Object.freeze([
  { key: "logo_motion", seconds: 10, kind: "video", mode: "logo" },
  { key: "entrance", seconds: 8, kind: "image" },
  { key: "dinner", seconds: 9, kind: "image" },
  { key: "food", seconds: 7, kind: "image" },
  { key: "pool_video", seconds: 12, kind: "video" },
  { key: "shuffleboard", seconds: 9, kind: "image" },
  { key: "cole_identity", seconds: 8, kind: "image", mode: "identity" },
  { key: "stage_video", seconds: 14, kind: "video" },
  { key: "pool_still", seconds: 7, kind: "image" },
  { key: "logo_3d", seconds: 6, kind: "image", mode: "logo_close" },
]);

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

function text(value) {
  return String(value ?? "").trim();
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
        reject(new Error("CHURCHILL_NIGHT_CHANGES_MEDIA_TIMEOUT"));
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
      else resolve({ stdout: out, stderr: err });
    });
  });
}

function storagePath(projectId) {
  return `${ORG}/${projectId}/churchill-night-changes-v1/churchill-night-changes-authentic-master-v1-90s.mp4`;
}

function storageUrl(storagePathValue) {
  return `storage://${BUCKET}/${storagePathValue}`;
}

async function signed(storagePathValue, seconds = 86400) {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(storagePathValue, seconds);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("CHURCHILL_MASTER_SIGNED_URL_MISSING");
  return data.signedUrl;
}

async function findMission() {
  const { data, error } = await supabaseAdmin
    .from("creative_missions")
    .select("*")
    .eq("organization_id", ORG)
    .eq("metadata->>command_identity", COMMAND_IDENTITY)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function ensureStudioProject() {
  let mission = await findMission();
  const selectedAssetIds = [...new Set(Object.values(SOURCE))];
  const objective = "Create a 90-second world-class Churchill Bar & Restaurant night film from authentic Churchill source media: cinematic 3D logo reveal, entrance, dinner and food, real venue bar atmosphere, pool and electric darts when present in the real source, shuffleboard, Cole Ley and live band, social energy, and a premium brand close. Preserve real faces, real logo, real venue and real games. No generic generated substitutes.";

  if (!mission) {
    mission = await CreativeMissionRuntime.create({
      organization_id: ORG,
      title: "Churchill — The Night Changes 90s",
      business_goal: "Create a flagship 90-second Churchill brand film for advertising and venue promotion.",
      objective,
      channels: ["facebook", "instagram", "youtube", "website"],
      metadata: {
        source: "creative_studio",
        command_identity: COMMAND_IDENTITY,
        production_type: "VIDEO",
        target_duration: MASTER_SECONDS,
        duration_mode: "FIXED",
        temporal_contract: { duration_seconds: MASTER_SECONDS },
        selected_asset_ids: selectedAssetIds,
        authenticity_contract: AUTHENTICITY,
        desired_outcome: "A premium, authentic Churchill film that makes viewers want to come for dinner and stay for the night.",
        communication_goal: "Churchill is one complete night out: dinner, drinks, games and live music.",
        tone: "cinematic, premium, warm, energetic, authentic",
        emotion: "anticipation, appetite, fun, belonging",
        call_to_action: "Come for dinner. Stay for the night.",
        publication_authorized: false,
      },
    });
  } else {
    mission = await CreativeMissionRuntime.update(mission.id, {
      objective,
      metadata: {
        ...(mission.metadata || {}),
        command_identity: COMMAND_IDENTITY,
        production_type: "VIDEO",
        target_duration: MASTER_SECONDS,
        duration_mode: "FIXED",
        temporal_contract: { duration_seconds: MASTER_SECONDS },
        selected_asset_ids: selectedAssetIds,
        authenticity_contract: AUTHENTICITY,
        publication_authorized: false,
      },
    });
  }

  const started = await CreativeMissionRuntime.start(mission.id);
  const projectId = started.runtime_context?.creative_project_id;
  if (!projectId) throw new Error("CHURCHILL_STUDIO_PROJECT_REQUIRED");
  let project = await CreativeProjectRuntime.get(projectId);
  project = await CreativeProjectRuntime.update(project.id, {
    objective,
    production_type: "VIDEO",
    target_duration: MASTER_SECONDS,
    metadata: {
      ...(project.metadata || {}),
      command_identity: COMMAND_IDENTITY,
      selected_asset_ids: selectedAssetIds,
      authenticity_contract: AUTHENTICITY,
      source_asset_manifest: SOURCE,
      film_structure: SEGMENTS,
      output_contract: "CHURCHILL_AUTHENTIC_NIGHT_FILM_V1",
      publication_authorized: false,
    },
  });
  return { mission, project };
}

async function sourceAssets() {
  const ids = [...new Set(Object.values(SOURCE))];
  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select("*")
    .eq("organization_id", ORG)
    .in("id", ids);
  if (error) throw error;
  const byId = new Map((data || []).map((asset) => [asset.id, asset]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) throw new Error(`CHURCHILL_AUTHENTIC_SOURCE_MISSING:${missing.join(",")}`);
  return byId;
}

function assetUrl(asset) {
  const value = text(asset?.file_url || asset?.image_url || asset?.thumbnail_url);
  if (!value) throw new Error(`CHURCHILL_SOURCE_URL_MISSING:${asset?.id || "unknown"}`);
  if (!value.startsWith("storage://")) return value;
  const prefix = `storage://${BUCKET}/`;
  const pathValue = value.startsWith(prefix) ? value.slice(prefix.length) : value.replace(/^storage:\/\/[^/]+\//, "");
  return signed(pathValue, 7200);
}

function baseVideoFilter(seconds, { image = false, mode = "" } = {}) {
  const fadeOutStart = Math.max(0, seconds - 0.45).toFixed(3);
  const base = image
    ? "scale=2200:1238:force_original_aspect_ratio=increase,crop=2200:1238,zoompan=z='min(zoom+0.00045,1.075)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=24"
    : "fps=24,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080";
  const grade = mode === "logo"
    ? "eq=contrast=1.035:saturation=1.01:brightness=-0.005"
    : "eq=contrast=1.025:saturation=1.02:brightness=-0.008";
  return `${base},setsar=1,${grade},fade=t=in:st=0:d=0.35,fade=t=out:st=${fadeOutStart}:d=0.45,format=yuv420p`;
}

async function renderSegment({ ffmpeg, asset, segment, index, directory }) {
  const url = await assetUrl(asset);
  const output = path.join(directory, `segment-${String(index + 1).padStart(2, "0")}.mp4`);
  const args = ["-y"];
  if (segment.kind === "image") args.push("-loop", "1", "-framerate", String(FPS));
  if (segment.kind === "video") args.push("-stream_loop", "-1");
  args.push("-i", url);
  args.push(
    "-t", String(segment.seconds),
    "-vf", baseVideoFilter(segment.seconds, { image: segment.kind === "image", mode: segment.mode }),
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "17",
    "-r", String(FPS),
    "-vsync", "cfr",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    output,
  );
  await run(ffmpeg, args, 180000);
  return output;
}

async function probe(ffprobe, input) {
  const result = await run(ffprobe, [
    "-v", "error",
    "-show_entries", "format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,sample_rate,channels",
    "-of", "json",
    input,
  ], 60000);
  return JSON.parse(result.stdout || "{}");
}

async function uploadOutput(localPath, outputPath) {
  const bytes = await fs.readFile(localPath);
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(outputPath, bytes, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
    metadata: {
      organization_id: ORG,
      command_identity: COMMAND_IDENTITY,
      authenticity_contract: AUTHENTICITY.contract,
      checksum,
    },
  });
  if (error) throw error;
  return { bytes: bytes.length, checksum };
}

async function registerOutput({ mission, project, outputPath, stored, technicalQc }) {
  const existing = await CreativeAssetsRuntime.list({
    organization_id: ORG,
    creative_project_id: project.id,
    limit: 200,
  });
  const prior = existing.find((asset) => asset.metadata?.command_identity === COMMAND_IDENTITY && asset.metadata?.role === "AUTHENTIC_MASTER") || null;
  let asset;
  const values = {
    organization_id: ORG,
    creative_mission_id: mission.id,
    creative_project_id: project.id,
    asset_type: "VIDEO",
    file_url: storageUrl(outputPath),
    name: "Churchill — The Night Changes · Authentic 90s Master V1",
    title: "Churchill — The Night Changes · Authentic 90s Master V1",
    file_name: path.basename(outputPath),
    tags: ["churchill", "90s", "authentic-master", "night-film", "creative-studio"],
    ai_generated: false,
    metadata: {
      command_identity: COMMAND_IDENTITY,
      role: "AUTHENTIC_MASTER",
      creative_project_id: project.id,
      creative_mission_id: mission.id,
      duration_seconds: MASTER_SECONDS,
      authenticity_contract: AUTHENTICITY,
      source_asset_ids: [...new Set(Object.values(SOURCE))],
      technical_qc: technicalQc,
      checksum: stored.checksum,
      bytes: stored.bytes,
      publication_authorized: false,
      review_required: true,
    },
  };
  if (prior) asset = await CreativeAssetsRuntime.update(prior.id, values);
  else asset = await CreativeAssetsRuntime.create(values);

  await CreativeProjectRuntime.update(project.id, {
    metadata: {
      ...(project.metadata || {}),
      churchill_night_changes_v1: {
        status: "RENDERED_REVIEW_REQUIRED",
        master_asset_id: asset.id,
        storage_path: outputPath,
        checksum: stored.checksum,
        bytes: stored.bytes,
        duration_seconds: MASTER_SECONDS,
        authenticity_contract: AUTHENTICITY.contract,
        technical_qc: technicalQc,
        publication_authorized: false,
        updated_at: new Date().toISOString(),
      },
    },
  });
  return asset;
}

async function render() {
  const ffmpeg = resolveCreativeFfmpegPath();
  const ffprobe = resolveCreativeFfprobePath();
  if (!ffmpeg || !ffprobe) throw new Error("CHURCHILL_STUDIO_MEDIA_BINARIES_NOT_READY");

  const { mission, project } = await ensureStudioProject();
  const assets = await sourceAssets();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "churchill-night-changes-v1-"));
  const concatList = path.join(directory, "visuals.txt");
  const visualMaster = path.join(directory, "visual-master.mp4");
  const finalMaster = path.join(directory, "churchill-night-changes-v1.mp4");
  try {
    const segmentFiles = [];
    for (let index = 0; index < SEGMENTS.length; index += 1) {
      const segment = SEGMENTS[index];
      const asset = assets.get(SOURCE[segment.key]);
      segmentFiles.push(await renderSegment({ ffmpeg, asset, segment, index, directory }));
    }
    const total = SEGMENTS.reduce((sum, segment) => sum + segment.seconds, 0);
    if (Math.abs(total - MASTER_SECONDS) > 0.001) throw new Error(`CHURCHILL_SEGMENT_DURATION_INVALID:${total}`);

    await fs.writeFile(concatList, segmentFiles.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
    await run(ffmpeg, [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", concatList,
      "-an",
      "-c:v", "copy",
      "-fflags", "+genpts",
      "-movflags", "+faststart",
      visualMaster,
    ], 120000);

    const scoreAsset = assets.get(SOURCE.score);
    const scoreUrl = await assetUrl(scoreAsset);
    await run(ffmpeg, [
      "-y",
      "-i", visualMaster,
      "-stream_loop", "-1",
      "-i", scoreUrl,
      "-filter_complex", `[1:a]atrim=0:${MASTER_SECONDS},asetpts=PTS-STARTPTS,aresample=48000,volume=0.42,afade=t=in:st=0:d=2.2,afade=t=out:st=85:d=5,alimiter=limit=0.95[aout]`,
      "-map", "0:v:0",
      "-map", "[aout]",
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "256k",
      "-ar", "48000",
      "-ac", "2",
      "-t", String(MASTER_SECONDS),
      "-movflags", "+faststart",
      finalMaster,
    ], 180000);

    const media = await probe(ffprobe, finalMaster);
    const duration = Number(media?.format?.duration || 0);
    const video = (media?.streams || []).find((stream) => stream.codec_type === "video");
    const audio = (media?.streams || []).find((stream) => stream.codec_type === "audio");
    if (!video || !audio) throw new Error("CHURCHILL_MASTER_AV_REQUIRED");
    if (Number(video.width) !== WIDTH || Number(video.height) !== HEIGHT) throw new Error(`CHURCHILL_MASTER_DIMENSIONS_INVALID:${video.width}x${video.height}`);
    if (Math.abs(duration - MASTER_SECONDS) > 0.35) throw new Error(`CHURCHILL_MASTER_DURATION_INVALID:${duration}`);
    const fps = text(video.r_frame_rate || video.avg_frame_rate);
    if (fps !== "24/1") throw new Error(`CHURCHILL_MASTER_FPS_INVALID:${fps}`);

    const outputPath = storagePath(project.id);
    const stored = await uploadOutput(finalMaster, outputPath);
    const technicalQc = {
      passed: true,
      duration_seconds: duration,
      width: Number(video.width),
      height: Number(video.height),
      frame_rate: fps,
      video_codec: video.codec_name || null,
      audio_codec: audio.codec_name || null,
      sample_rate: Number(audio.sample_rate || 0) || null,
      channels: Number(audio.channels || 0) || null,
      authentic_source_lock: true,
      no_face_regeneration: true,
    };
    const outputAsset = await registerOutput({ mission, project, outputPath, stored, technicalQc });
    return {
      success: true,
      status: "RENDERED_REVIEW_REQUIRED",
      mission_id: mission.id,
      creative_project_id: project.id,
      master_asset_id: outputAsset.id,
      output_path: outputPath,
      signed_url: await signed(outputPath, 86400),
      duration_seconds: duration,
      authenticity_contract: AUTHENTICITY,
      technical_qc: technicalQc,
      publication_authorized: false,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

async function status() {
  const mission = await findMission();
  if (!mission) return { success: true, status: "NOT_STARTED", command_identity: COMMAND_IDENTITY };
  const { data: projects, error } = await supabaseAdmin
    .from("creative_projects")
    .select("*")
    .eq("organization_id", ORG)
    .eq("creative_mission_id", mission.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const project = projects?.[0] || null;
  const state = project?.metadata?.churchill_night_changes_v1 || null;
  const outputPath = state?.storage_path || null;
  let signedUrl = null;
  if (outputPath) signedUrl = await signed(outputPath, 86400).catch(() => null);
  return {
    success: true,
    status: state?.status || "PREPARED",
    mission_id: mission.id,
    creative_project_id: project?.id || null,
    master_asset_id: state?.master_asset_id || null,
    output_path: outputPath,
    signed_url: signedUrl,
    duration_seconds: state?.duration_seconds || MASTER_SECONDS,
    authenticity_contract: AUTHENTICITY,
    technical_qc: state?.technical_qc || null,
    publication_authorized: false,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    if (action === "status") return json(await status());
    if (action === "prepare") {
      const { mission, project } = await ensureStudioProject();
      return json({
        success: true,
        status: "PREPARED",
        mission_id: mission.id,
        creative_project_id: project.id,
        authenticity_contract: AUTHENTICITY,
        segment_count: SEGMENTS.length,
        duration_seconds: MASTER_SECONDS,
        publication_authorized: false,
      });
    }
    if (action === "render") return json(await render());
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("CREATIVE_CHURCHILL_NIGHT_CHANGES_V1_FAILED", {
      message: error?.message || String(error),
    });
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
