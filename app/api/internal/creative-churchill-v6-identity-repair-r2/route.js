export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import {
  creativeRawStillInputArgs,
  normalizeCreativeStillImage,
} from "@/lib/creative/media/runtime/CreativeStillImageInputRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "da38f668-11a1-4760-a8f2-6adc3effdab5";
const BUCKET = "creative-assets";
const TOKEN = "churchill-v6-identity-repair-r2-20260822";
const VERSION = "CHURCHILL_V6_AUTHENTIC_IDENTITY_REPAIR_R3_CANONICAL_STILL_INPUT";
const ENTRANCE_ASSET_ID = "f0c96f1a-6719-4dc2-8b9a-d095864d273a";
const LOGO_ASSET_ID = "f2e57100-1b78-43c9-b080-1c7945fc4d23";

function text(value) { return String(value ?? "").trim(); }
function json(value, status = 200) { return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } }); }

function run(command, args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, OMP_NUM_THREADS: "1" } });
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) { settled = true; reject(new Error("CHURCHILL_V6_R3_MEDIA_TIMEOUT")); }
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
      if (code === 0) resolve();
      else reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-16000) || `CHURCHILL_V6_R3_MEDIA_EXIT_${code}`));
    });
  });
}

async function getProject() {
  const { data, error } = await supabaseAdmin.from("creative_projects").select("id,metadata").eq("id", PROJECT_ID).eq("organization_id", ORGANIZATION_ID).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V6_R3_PROJECT_REQUIRED");
  return data;
}

async function getAsset(id) {
  const { data, error } = await supabaseAdmin.from("creative_assets").select("id,file_url,image_url,thumbnail_url,source_type,ai_generated,metadata").eq("id", id).eq("organization_id", ORGANIZATION_ID).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`CHURCHILL_V6_R3_ASSET_REQUIRED:${id}`);
  if (data.ai_generated === true || text(data.source_type).toLowerCase() === "ai_generation") throw new Error(`CHURCHILL_V6_R3_AUTHENTIC_SOURCE_REQUIRED:${id}`);
  return data;
}

function storagePathFromReference(value) {
  const reference = text(value);
  const directPrefix = `storage://${BUCKET}/`;
  if (reference.startsWith(directPrefix)) return reference.slice(directPrefix.length);
  for (const marker of [`/storage/v1/object/public/${BUCKET}/`, `/storage/v1/object/sign/${BUCKET}/`]) {
    const index = reference.indexOf(marker);
    if (index >= 0) return decodeURIComponent(reference.slice(index + marker.length).split("?")[0]);
  }
  throw new Error("CHURCHILL_V6_R3_STORAGE_PATH_REQUIRED");
}

async function downloadAssetBuffer(asset) {
  const reference = asset.file_url || asset.image_url || asset.thumbnail_url;
  const storagePath = storagePathFromReference(reference);
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`CHURCHILL_V6_R3_SOURCE_EMPTY:${asset.id}`);
  return Buffer.from(await data.arrayBuffer());
}

async function renderEntrance(ffmpeg, input, output) {
  const filter = [
    "[0:v]split=2[bg0][fg0]",
    "[bg0]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,gblur=sigma=32,eq=contrast=1.02:saturation=0.72:brightness=-0.08[bg]",
    "[fg0]scale=-2:1080,eq=contrast=1.015:saturation=1.00:brightness=-0.005[fg]",
    "[bg][fg]overlay=(W-w)/2:0[base]",
    "[base]zoompan=z='min(1+on*0.00015,1.018)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=24,fade=t=in:st=0:d=0.28,fade=t=out:st=4.72:d=0.28,format=yuv420p[out]",
  ].join(";");
  await run(ffmpeg, ["-y", ...creativeRawStillInputArgs(input, { fps: 24, loop: true }), "-t", "5", "-filter_complex", filter, "-map", "[out]", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-r", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
}

async function renderLogo(ffmpeg, input, output) {
  const filter = "scale=1600:900:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,zoompan=z='min(1+on*0.00004,1.008)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=24,fade=t=in:st=0:d=0.45,fade=t=out:st=8.2:d=0.8,format=yuv420p";
  await run(ffmpeg, ["-y", ...creativeRawStillInputArgs(input, { fps: 24, loop: true }), "-t", "9", "-vf", filter, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "13", "-r", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
}

async function uploadOutput(file, sceneKey) {
  const buffer = await fs.readFile(file);
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  const storagePath = `${ORGANIZATION_ID}/${PROJECT_ID}/churchill-v6/identity-repairs-r3/${sceneKey}-${checksum.slice(0, 12)}.mp4`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, buffer, { contentType: "video/mp4", upsert: true, cacheControl: "3600", metadata: { organization_id: ORGANIZATION_ID, creative_project_id: PROJECT_ID, version: VERSION, scene_key: sceneKey, ai_generated: "false", source_policy: "AUTHENTIC_EDITORIAL_ONLY_CANONICAL_STILL_INPUT", publication_authorized: "false" } });
  if (error) throw error;
  return { output_reference: `storage://${BUCKET}/${storagePath}`, storage_path: storagePath, checksum_sha256: checksum, bytes: buffer.length };
}

async function patchProject(project, scenes) {
  const metadata = project.metadata || {};
  const previous = metadata.churchill_v6_repairs || {};
  const next = { ...previous, version: VERSION, status: "IN_REPAIR", master_assembly_allowed: false, publication_authorized: false, updated_at: new Date().toISOString(), still_image_pipeline: "SHARP_RAW_RGBA", ffmpeg_image_decoder_required: false, scenes: { ...(previous.scenes || {}), ...scenes } };
  const { error } = await supabaseAdmin.from("creative_projects").update({ metadata: { ...metadata, churchill_v6_repairs: next }, updated_at: new Date().toISOString() }).eq("id", PROJECT_ID).eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;
}

async function render() {
  const project = await getProject();
  if (project.metadata?.churchill_v6_source_gate?.status !== "ACTIVE") throw new Error("CHURCHILL_V6_R3_SOURCE_GATE_REQUIRED");
  if (project.metadata?.churchill_v6_source_gate?.master_assembly_allowed === true) throw new Error("CHURCHILL_V6_R3_MASTER_MUST_REMAIN_BLOCKED");

  const entrance = await getAsset(ENTRANCE_ASSET_ID);
  const logo = await getAsset(LOGO_ASSET_ID);
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CHURCHILL_V6_R3_FFMPEG_REQUIRED");

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "churchill-v6-r3-"));
  try {
    const [entranceBuffer, logoBuffer] = await Promise.all([
      downloadAssetBuffer(entrance),
      downloadAssetBuffer(logo),
    ]);
    const [entranceInput, logoInput] = await Promise.all([
      normalizeCreativeStillImage({ input_buffer: entranceBuffer, output_directory: directory, name: "entrance-source" }),
      normalizeCreativeStillImage({ input_buffer: logoBuffer, output_directory: directory, name: "logo-source" }),
    ]);
    const entranceOutput = path.join(directory, "entrance.mp4");
    const logoOutput = path.join(directory, "logo.mp4");
    await renderEntrance(ffmpeg, entranceInput, entranceOutput);
    await renderLogo(ffmpeg, logoInput, logoOutput);
    const [entranceStored, logoStored] = await Promise.all([
      uploadOutput(entranceOutput, "scene_02_entrance_into_night"),
      uploadOutput(logoOutput, "scene_15_logo_epilogue"),
    ]);
    const repairedAt = new Date().toISOString();
    const scenes = {
      scene_02_entrance_into_night: { status: "REVIEW_REQUIRED", repair_decision: "AUTHENTIC_EDITORIAL_CANONICAL_STILL_INPUT", source_type: "AUTHENTIC_USER_UPLOAD_EDITORIAL_ONLY", source_asset_id: ENTRANCE_ASSET_ID, source_ai_generated: false, output_ai_generated: false, generated_architecture_allowed: false, still_image_decoder: entranceInput.decoder, ffmpeg_image_decoder_required: entranceInput.ffmpeg_image_decoder_required, duration_seconds: 5, ...entranceStored, approved_for_master: false, publication_authorized: false, human_review_complete: false, repaired_at: repairedAt },
      scene_15_logo_epilogue: { status: "REVIEW_REQUIRED", repair_decision: "EXACT_LOGO_CANONICAL_STILL_INPUT", source_type: "EXACT_USER_UPLOADED_LOGO_EDITORIAL_ONLY", source_asset_id: LOGO_ASSET_ID, source_ai_generated: false, output_ai_generated: false, logo_regeneration_allowed: false, still_image_decoder: logoInput.decoder, ffmpeg_image_decoder_required: logoInput.ffmpeg_image_decoder_required, duration_seconds: 9, ...logoStored, approved_for_master: false, publication_authorized: false, human_review_complete: false, repaired_at: repairedAt },
    };
    await patchProject(project, scenes);
    return { success: true, version: VERSION, still_image_pipeline: "SHARP_RAW_RGBA", ffmpeg_image_decoder_required: false, scenes };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

async function review(sceneKey) {
  const project = await getProject();
  const reference = text(project.metadata?.churchill_v6_repairs?.scenes?.[sceneKey]?.output_reference);
  if (!reference) return json({ success: false, error: "CHURCHILL_V6_R3_REPAIR_NOT_RENDERED", scene_key: sceneKey }, 409);
  const storagePath = storagePathFromReference(reference);
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, 21600);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("CHURCHILL_V6_R3_REVIEW_URL_REQUIRED");
  return Response.redirect(data.signedUrl, 307);
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    if (action === "render") return json(await render());
    if (action === "review") {
      const scene = text(url.searchParams.get("scene"));
      if (!["scene_02_entrance_into_night", "scene_15_logo_epilogue"].includes(scene)) return json({ success: false, error: "CHURCHILL_V6_R3_SCENE_UNSUPPORTED" }, 400);
      return review(scene);
    }
    const project = await getProject();
    return json({ success: true, version: VERSION, repairs: project.metadata?.churchill_v6_repairs || null });
  } catch (error) {
    console.error("CHURCHILL_V6_IDENTITY_REPAIR_R3_FAILED", { message: error?.message || String(error), details: error?.details || null });
    return json({ success: false, error: error?.message || String(error), details: error?.details || null }, 500);
  }
}
