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

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "da38f668-11a1-4760-a8f2-6adc3effdab5";
const TOKEN = "churchill-v6-identity-repair-20260822";
const BUCKET = "creative-assets";
const VERSION = "CHURCHILL_V6_AUTHENTIC_IDENTITY_REPAIR_R1";
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 24;

const ENTRANCE_ASSET_ID = "f0c96f1a-6719-4dc2-8b9a-d095864d273a";
const LOGO_ASSET_ID = "f2e57100-1b78-43c9-b080-1c7945fc4d23";

function text(value) {
  return String(value ?? "").trim();
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function run(command, args, timeoutMs = 180000) {
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
        reject(new Error("CHURCHILL_V6_IDENTITY_REPAIR_MEDIA_TIMEOUT"));
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
      else reject(new Error(err.slice(-16000) || `CHURCHILL_V6_IDENTITY_REPAIR_MEDIA_EXIT_${code}`));
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
  if (!data) throw new Error("CHURCHILL_V6_PROJECT_REQUIRED");
  return data;
}

async function asset(id) {
  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select("id,file_url,image_url,thumbnail_url,source_type,ai_generated,metadata")
    .eq("id", id)
    .eq("organization_id", ORGANIZATION_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`CHURCHILL_V6_ASSET_REQUIRED:${id}`);
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
  if (!reference) throw new Error("CHURCHILL_V6_REFERENCE_REQUIRED");
  const storagePath = storagePathFromReference(reference);
  if (!storagePath) {
    if (/^https:\/\//i.test(reference)) return reference;
    throw new Error("CHURCHILL_V6_REFERENCE_UNSUPPORTED");
  }
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("CHURCHILL_V6_SIGNED_URL_REQUIRED");
  return data.signedUrl;
}

function enforceAuthenticSource(source, expectedId) {
  if (source.id !== expectedId) throw new Error("CHURCHILL_V6_SOURCE_ID_MISMATCH");
  if (source.ai_generated === true || text(source.source_type).toLowerCase() === "ai_generation") {
    throw new Error(`CHURCHILL_V6_AUTHENTIC_SOURCE_REQUIRED:${expectedId}`);
  }
}

async function renderEntrance(ffmpeg, sourceUrl, output) {
  const filter = [
    `[0:v]split=2[bg0][fg0]`,
    `[bg0]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},gblur=sigma=30,eq=contrast=1.01:saturation=0.72:brightness=-0.075[bg]`,
    `[fg0]scale=812:${HEIGHT},setsar=1,zoompan=z='min(1.0+on*0.00010,1.012)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=812x${HEIGHT}:fps=${FPS},eq=contrast=1.015:saturation=1.0:brightness=-0.005[fg]`,
    `[bg][fg]overlay=(W-w)/2:0,fade=t=in:st=0:d=0.28,fade=t=out:st=4.70:d=0.30,format=yuv420p[out]`,
  ].join(";");

  await run(ffmpeg, [
    "-y",
    "-framerate", String(FPS),
    "-loop", "1",
    "-i", sourceUrl,
    "-t", "5",
    "-filter_complex", filter,
    "-map", "[out]",
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "15",
    "-r", String(FPS),
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    output,
  ]);
}

async function renderLogo(ffmpeg, sourceUrl, output) {
  const filter = [
    `[0:v]scale=${WIDTH}:960:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`,
    `zoompan=z='min(1.0+on*0.00004,1.008)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${WIDTH}x${HEIGHT}:fps=${FPS}`,
    `fade=t=in:st=0:d=0.50,fade=t=out:st=8.20:d=0.80,format=yuv420p[out]`,
  ].join(",");

  await run(ffmpeg, [
    "-y",
    "-framerate", String(FPS),
    "-loop", "1",
    "-i", sourceUrl,
    "-t", "9",
    "-vf", filter,
    "-map", "[out]",
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "14",
    "-r", String(FPS),
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    output,
  ]);
}

async function upload(file, sceneKey) {
  const buffer = await fs.readFile(file);
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  const target = `${ORGANIZATION_ID}/${PROJECT_ID}/churchill-v6/identity-repairs/${sceneKey}-${checksum.slice(0, 12)}.mp4`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(target, buffer, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
    metadata: {
      organization_id: ORGANIZATION_ID,
      creative_project_id: PROJECT_ID,
      version: VERSION,
      scene_key: sceneKey,
      checksum,
      ai_generated: "false",
      source_policy: "AUTHENTIC_EDITORIAL_ONLY",
      publication_authorized: "false",
    },
  });
  if (error) throw error;
  return {
    output_reference: `storage://${BUCKET}/${target}`,
    storage_path: target,
    checksum_sha256: checksum,
    bytes: buffer.length,
  };
}

async function patchRepairs(p, repairs) {
  const metadata = p.metadata || {};
  const previous = metadata.churchill_v6_repairs || {};
  const next = {
    ...previous,
    version: VERSION,
    status: "IN_REPAIR",
    master_assembly_allowed: false,
    publication_authorized: false,
    updated_at: new Date().toISOString(),
    scenes: {
      ...(previous.scenes || {}),
      ...repairs,
    },
  };

  const { error } = await supabaseAdmin
    .from("creative_projects")
    .update({
      metadata: { ...metadata, churchill_v6_repairs: next },
      updated_at: new Date().toISOString(),
    })
    .eq("id", PROJECT_ID)
    .eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;
  return next;
}

async function renderIdentityRepairs() {
  const p = await project();
  if (p.metadata?.churchill_v6_source_gate?.status !== "ACTIVE") {
    throw new Error("CHURCHILL_V6_SOURCE_GATE_REQUIRED");
  }
  if (p.metadata?.churchill_v6_source_gate?.master_assembly_allowed === true) {
    throw new Error("CHURCHILL_V6_MASTER_MUST_REMAIN_BLOCKED_DURING_REPAIR");
  }

  const entrance = await asset(ENTRANCE_ASSET_ID);
  const logo = await asset(LOGO_ASSET_ID);
  enforceAuthenticSource(entrance, ENTRANCE_ASSET_ID);
  enforceAuthenticSource(logo, LOGO_ASSET_ID);

  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CHURCHILL_V6_FFMPEG_REQUIRED");

  const entranceUrl = await signedReference(entrance.file_url || entrance.image_url || entrance.thumbnail_url);
  const logoUrl = await signedReference(logo.file_url || logo.image_url || logo.thumbnail_url);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "churchill-v6-identity-"));

  try {
    const entranceFile = path.join(directory, "scene-02-entrance.mp4");
    const logoFile = path.join(directory, "scene-15-logo.mp4");
    await renderEntrance(ffmpeg, entranceUrl, entranceFile);
    await renderLogo(ffmpeg, logoUrl, logoFile);

    const entranceOutput = await upload(entranceFile, "scene_02_entrance_into_night");
    const logoOutput = await upload(logoFile, "scene_15_logo_epilogue");

    const repairs = {
      scene_02_entrance_into_night: {
        status: "REVIEW_REQUIRED",
        repair_decision: "AUTHENTIC_EDITORIAL_REPLACEMENT",
        source_type: "AUTHENTIC_EDITORIAL_ONLY",
        source_asset_id: ENTRANCE_ASSET_ID,
        source_ai_generated: false,
        generated_architecture_allowed: false,
        output_ai_generated: false,
        duration_seconds: 5,
        ...entranceOutput,
        approved_for_master: false,
        publication_authorized: false,
        human_review_complete: false,
        repaired_at: new Date().toISOString(),
      },
      scene_15_logo_epilogue: {
        status: "REVIEW_REQUIRED",
        repair_decision: "EXACT_LOGO_EDITORIAL_REPLACEMENT",
        source_type: "EXACT_USER_UPLOADED_LOGO_EDITORIAL_ONLY",
        source_asset_id: LOGO_ASSET_ID,
        source_ai_generated: false,
        logo_regeneration_allowed: false,
        output_ai_generated: false,
        duration_seconds: 9,
        ...logoOutput,
        approved_for_master: false,
        publication_authorized: false,
        human_review_complete: false,
        repaired_at: new Date().toISOString(),
      },
    };

    await patchRepairs(p, repairs);
    return { success: true, version: VERSION, scenes: repairs };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

async function status() {
  const p = await project();
  return {
    success: true,
    version: VERSION,
    source_gate: p.metadata?.churchill_v6_source_gate || null,
    repairs: p.metadata?.churchill_v6_repairs || null,
  };
}

async function review(sceneKey) {
  const p = await project();
  const ref = text(p.metadata?.churchill_v6_repairs?.scenes?.[sceneKey]?.output_reference);
  if (!ref) return json({ success: false, error: "CHURCHILL_V6_REPAIR_NOT_RENDERED", scene_key: sceneKey }, 409);
  const storagePath = storagePathFromReference(ref);
  if (!storagePath) throw new Error("CHURCHILL_V6_REPAIR_STORAGE_REFERENCE_INVALID");
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, 21600);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("CHURCHILL_V6_REPAIR_REVIEW_URL_REQUIRED");
  return Response.redirect(data.signedUrl, 307);
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    if (action === "status") return json(await status());
    if (action === "render") return json(await renderIdentityRepairs());
    if (action === "review") {
      const sceneKey = text(url.searchParams.get("scene"));
      if (!["scene_02_entrance_into_night", "scene_15_logo_epilogue"].includes(sceneKey)) {
        return json({ success: false, error: "CHURCHILL_V6_REPAIR_SCENE_UNSUPPORTED" }, 400);
      }
      return await review(sceneKey);
    }
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("CHURCHILL_V6_IDENTITY_REPAIR_FAILED", {
      message: error?.message || String(error),
      details: error?.details || null,
    });
    return json({ success: false, error: error?.message || String(error), details: error?.details || null }, 500);
  }
}