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
  CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
  assertChurchillNightStoryIntegrity,
} from "@/lib/creative/concepts/ChurchillNightChangesStoryContract";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "da38f668-11a1-4760-a8f2-6adc3effdab5";
const TOKEN = "churchill-night-changes-v3-editorial-20260822";
const BUCKET = "creative-assets";
const VERSION = "CHURCHILL_V3_EDITORIAL_R1";
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 24;

const ASSET = Object.freeze({
  pool_video_real: "d10ddc3a-386f-403b-9bb4-2cfe40c7c655",
  dining_video_real: "fb7e06e3-77cb-49f3-9f11-9fa59887b6be",
});

function text(value) {
  return String(value ?? "").trim();
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

function run(command, args, timeoutMs = 240000) {
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
        reject(new Error("CHURCHILL_V3_EDITORIAL_TIMEOUT"));
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
      else reject(new Error(err.slice(-12000) || `CHURCHILL_V3_EDITORIAL_MEDIA_EXIT_${code}`));
    });
  });
}

async function project() {
  assertChurchillNightStoryIntegrity();
  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("*")
    .eq("id", PROJECT_ID)
    .eq("organization_id", ORGANIZATION_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V3_EDITORIAL_PROJECT_REQUIRED");
  if (data.metadata?.canonical_story_version !== CHURCHILL_NIGHT_CHANGES_STORY_VERSION) {
    throw new Error("CHURCHILL_V3_EDITORIAL_STORY_VERSION_MISMATCH");
  }
  return data;
}

async function asset(id) {
  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select("id,file_url,image_url,thumbnail_url,ai_generated,provider,metadata")
    .eq("id", id)
    .eq("organization_id", ORGANIZATION_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`CHURCHILL_V3_EDITORIAL_ASSET_MISSING:${id}`);
  return data;
}

function storagePathFromReference(value) {
  const reference = text(value);
  const prefix = `storage://${BUCKET}/`;
  if (reference.startsWith(prefix)) return reference.slice(prefix.length);
  const publicNeedle = `/storage/v1/object/public/${BUCKET}/`;
  const signedNeedle = `/storage/v1/object/sign/${BUCKET}/`;
  const publicIndex = reference.indexOf(publicNeedle);
  if (publicIndex >= 0) return decodeURIComponent(reference.slice(publicIndex + publicNeedle.length).split("?")[0]);
  const signedIndex = reference.indexOf(signedNeedle);
  if (signedIndex >= 0) return decodeURIComponent(reference.slice(signedIndex + signedNeedle.length).split("?")[0]);
  return null;
}

async function signedReference(value, seconds = 7200) {
  const reference = text(value);
  if (!reference) throw new Error("CHURCHILL_V3_EDITORIAL_REFERENCE_REQUIRED");
  const storagePath = storagePathFromReference(reference);
  if (!storagePath) {
    if (/^https:\/\//i.test(reference)) return reference;
    throw new Error("CHURCHILL_V3_EDITORIAL_REFERENCE_UNSUPPORTED");
  }
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("CHURCHILL_V3_EDITORIAL_SIGNED_URL_REQUIRED");
  return data.signedUrl;
}

async function assetUrl(id) {
  const item = await asset(id);
  return signedReference(item.file_url || item.image_url || item.thumbnail_url);
}

function completedReference(node) {
  return node?.status === "COMPLETED" && node?.output_reference ? node.output_reference : null;
}

function normalize(label) {
  return `[${label}:v]fps=${FPS},scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},setsar=1,format=yuv420p`;
}

async function uploadOutput(p, beat, file, metadata = {}) {
  const buffer = await fs.readFile(file);
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  const target = `${ORGANIZATION_ID}/${p.id}/churchill-night-inside-night-v3/editorial/${beat}-${checksum.slice(0, 12)}.mp4`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(target, buffer, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
    metadata: {
      organization_id: ORGANIZATION_ID,
      creative_project_id: p.id,
      canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
      editorial_version: VERSION,
      beat,
      checksum,
      ...metadata,
    },
  });
  if (error) throw error;
  return {
    output_reference: `storage://${BUCKET}/${target}`,
    checksum,
    bytes: buffer.length,
    output_path: target,
  };
}

async function patchEditorial(p, beat, result) {
  const metadata = p.metadata || {};
  const current = metadata.churchill_v3_editorial || {};
  const outputs = current.outputs || {};
  const next = {
    ...current,
    version: VERSION,
    status: "REPAIR_IN_PROGRESS",
    outputs: {
      ...outputs,
      [beat]: {
        ...result,
        status: "REVIEW_REQUIRED",
        technical_render_complete: true,
        visual_review_complete: false,
        approved_for_master: false,
        rendered_at: new Date().toISOString(),
      },
    },
    master_render_authorized: false,
    publication_authorized: false,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from("creative_projects")
    .update({ metadata: { ...metadata, churchill_v3_editorial: next }, updated_at: new Date().toISOString() })
    .eq("id", p.id)
    .eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;
  return next;
}

async function renderIce() {
  const p = await project();
  const original = p.metadata?.churchill_v3_vfx?.shots?.ice_time_freeze || null;
  const iceReference = completedReference(original);
  if (!iceReference) throw new Error("CHURCHILL_V3_EDITORIAL_APPROVED_ICE_PLATE_REQUIRED");
  const pool = await asset(ASSET.pool_video_real);
  if (pool.ai_generated === true || pool.provider !== "upload") throw new Error("CHURCHILL_V3_EDITORIAL_REAL_POOL_REQUIRED");

  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CHURCHILL_V3_EDITORIAL_FFMPEG_REQUIRED");
  const iceUrl = await signedReference(iceReference);
  const poolUrl = await assetUrl(ASSET.pool_video_real);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "churchill-v3-ice-editorial-"));
  const output = path.join(dir, "ice-authentic-pool.mp4");
  try {
    const filter = [
      `${normalize("0")}trim=duration=5.4,setpts=PTS-STARTPTS[ice]`,
      `${normalize("1")}trim=duration=2.9,setpts=PTS-STARTPTS[pool]`,
      `[ice][pool]xfade=transition=fade:duration=0.3:offset=5.1,format=yuv420p[out]`,
    ].join(";");
    await run(ffmpeg, [
      "-y",
      "-i", iceUrl,
      "-i", poolUrl,
      "-filter_complex", filter,
      "-map", "[out]",
      "-an",
      "-t", "8",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "15",
      "-r", String(FPS),
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      output,
    ]);
    const result = await uploadOutput(p, "ice_time_freeze_authentic_pool_landing", output, {
      source_ice_reference: iceReference,
      authentic_pool_asset_id: ASSET.pool_video_real,
      story_change_authorized: false,
    });
    await patchEditorial(p, "ice_time_freeze_authentic_pool_landing", result);
    return { success: true, status: "REVIEW_REQUIRED", beat: "ice_time_freeze", ...result, publication_authorized: false };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function renderWineLoop() {
  const p = await project();
  const wine = p.metadata?.churchill_v3_vfx?.shots?.wine_universe || null;
  const wineReference = completedReference(wine);
  if (!wineReference) throw new Error("CHURCHILL_V3_EDITORIAL_APPROVED_WINE_PLATE_REQUIRED");
  const dining = await asset(ASSET.dining_video_real);
  if (dining.ai_generated === true || dining.provider !== "upload") throw new Error("CHURCHILL_V3_EDITORIAL_REAL_DINING_REQUIRED");

  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CHURCHILL_V3_EDITORIAL_FFMPEG_REQUIRED");
  const wineUrl = await signedReference(wineReference);
  const diningUrl = await assetUrl(ASSET.dining_video_real);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "churchill-v3-wine-loop-"));
  const output = path.join(dir, "wine-loop-return.mp4");
  try {
    const filter = [
      `${normalize("0")}trim=start=0:end=1.25,setpts=PTS-STARTPTS,reverse[drop]`,
      `${normalize("1")}trim=duration=2.95,setpts=PTS-STARTPTS[dinner]`,
      `[drop][dinner]xfade=transition=fade:duration=0.2:offset=1.05,format=yuv420p[out]`,
    ].join(";");
    await run(ffmpeg, [
      "-y",
      "-i", wineUrl,
      "-i", diningUrl,
      "-filter_complex", filter,
      "-map", "[out]",
      "-an",
      "-t", "4",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "15",
      "-r", String(FPS),
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      output,
    ]);
    const result = await uploadOutput(p, "wine_loop_return_authentic_payoff", output, {
      approved_wine_reference: wineReference,
      authentic_dining_asset_id: ASSET.dining_video_real,
      story_change_authorized: false,
    });
    await patchEditorial(p, "wine_loop_return_authentic_payoff", result);
    return { success: true, status: "REVIEW_REQUIRED", beat: "wine_loop_return", ...result, publication_authorized: false };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function status() {
  const p = await project();
  return {
    success: true,
    version: VERSION,
    canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
    editorial: p.metadata?.churchill_v3_editorial || {},
    actions: {
      render_ice: "ZERO_GENERATION_AUTHENTIC_EDITORIAL_REPAIR",
      render_wine_loop: "ZERO_GENERATION_AUTHENTIC_EDITORIAL_REPAIR",
      shuffleboard_to_dart: "BLOCKED_PENDING_DART_ENTRY_VISUAL_APPROVAL",
      electric_dart_flight: "BLOCKED_PENDING_DART_ENTRY_VISUAL_APPROVAL",
      frozen_night_hero: "BLOCKED_UNTIL_COHERENT_AUTHENTIC_COMPOSITE_IS_READY",
    },
    master_render_authorized: false,
    publication_authorized: false,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    if (action === "status") return json(await status());
    if (action === "render_ice") return json(await renderIce());
    if (action === "render_wine_loop") return json(await renderWineLoop());
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("CHURCHILL_V3_EDITORIAL_FAILED", { message: error?.message || String(error) });
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
