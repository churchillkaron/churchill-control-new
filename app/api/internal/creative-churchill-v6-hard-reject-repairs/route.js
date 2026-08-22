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
const TOKEN = "churchill-v6-hard-reject-repairs-20260822";
const VERSION = "CHURCHILL_V6_HARD_REJECT_REPAIRS_V1";

const SCENE_CONTRACT = Object.freeze({
  scene_04_dinner_future_reflections: {
    source_kind: "dinner",
    duration: 6,
    role: "AUTHENTIC_DINNER_EDITORIAL",
    filter: "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='min(1+on*0.00011,1.016)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=24,eq=contrast=1.025:saturation=0.92:brightness=-0.012,fade=t=in:st=0:d=0.20,fade=t=out:st=5.72:d=0.28,format=yuv420p",
  },
  scene_07_pool_activation: {
    source_kind: "pool_darts",
    duration: 5,
    role: "AUTHENTIC_POOL_EDITORIAL",
    filter: "crop=iw:ih*0.78:0:ih*0.12,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='min(1+on*0.00016,1.020)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=24,eq=contrast=1.03:saturation=0.94:brightness=-0.018,fade=t=in:st=0:d=0.18,fade=t=out:st=4.75:d=0.25,format=yuv420p",
  },
  scene_10_electric_dart_flight: {
    source_kind: "pool_darts",
    duration: 4,
    role: "AUTHENTIC_ELECTRONIC_DARTS_EDITORIAL",
    filter: "crop=iw:ih*0.48:0:0,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='min(1.03+on*0.00020,1.055)':x='iw*0.53-(iw/zoom/2)':y='ih*0.40-(ih/zoom/2)':d=1:s=1920x1080:fps=24,eq=contrast=1.035:saturation=0.96:brightness=-0.02,fade=t=in:st=0:d=0.15,fade=t=out:st=3.75:d=0.25,format=yuv420p",
  },
  scene_11_band_activates_churchill: {
    source_kind: "band",
    duration: 6,
    role: "AUTHENTIC_BAND_EDITORIAL",
    filter: "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='min(1+on*0.00012,1.018)':x='iw/2-(iw/zoom/2)':y='ih*0.47-(ih/zoom/2)':d=1:s=1920x1080:fps=24,eq=contrast=1.02:saturation=0.90:brightness=-0.008,fade=t=in:st=0:d=0.18,fade=t=out:st=5.72:d=0.28,format=yuv420p",
  },
});

function text(value) { return String(value ?? "").trim(); }
function json(value, status = 200) { return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } }); }

function run(command, args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, OMP_NUM_THREADS: "1" } });
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) { settled = true; reject(new Error("CHURCHILL_V6_HARD_REPAIR_MEDIA_TIMEOUT")); }
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
      else reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-16000) || `CHURCHILL_V6_HARD_REPAIR_MEDIA_EXIT_${code}`));
    });
  });
}

async function getProject() {
  const { data, error } = await supabaseAdmin.from("creative_projects").select("id,metadata").eq("id", PROJECT_ID).eq("organization_id", ORGANIZATION_ID).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V6_HARD_REPAIR_PROJECT_REQUIRED");
  return data;
}

function sourceRecord(project, kind) {
  const record = project.metadata?.churchill_v6_authentic_sources?.sources?.[kind];
  if (!record || record.status !== "INGESTED_REVIEW_REQUIRED" || record.ai_generated !== false || !record.storage_path || !record.checksum_sha256) {
    throw new Error(`CHURCHILL_V6_AUTHENTIC_SOURCE_NOT_INGESTED:${kind}`);
  }
  return record;
}

async function downloadVerifiedSource(record) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(record.storage_path);
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V6_HARD_REPAIR_SOURCE_EMPTY");
  const buffer = Buffer.from(await data.arrayBuffer());
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  if (checksum !== record.checksum_sha256) throw new Error("CHURCHILL_V6_HARD_REPAIR_SOURCE_CHECKSUM_MISMATCH");
  return buffer;
}

async function renderScene(ffmpeg, input, sceneKey, contract, output) {
  await run(ffmpeg, [
    "-y",
    ...creativeRawStillInputArgs(input, { fps: 24, loop: true }),
    "-t", String(contract.duration),
    "-vf", contract.filter,
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "14",
    "-r", "24",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    output,
  ]);
}

async function uploadOutput(file, sceneKey) {
  const buffer = await fs.readFile(file);
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  const storagePath = `${ORGANIZATION_ID}/${PROJECT_ID}/churchill-v6/hard-reject-repairs/${sceneKey}-${checksum.slice(0, 12)}.mp4`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
    metadata: {
      organization_id: ORGANIZATION_ID,
      creative_project_id: PROJECT_ID,
      version: VERSION,
      scene_key: sceneKey,
      ai_generated: "false",
      publication_authorized: "false",
      repair_policy: "AUTHENTIC_SOURCE_EDITORIAL_ONLY",
    },
  });
  if (error) throw error;
  return { output_reference: `storage://${BUCKET}/${storagePath}`, storage_path: storagePath, checksum_sha256: checksum, bytes: buffer.length };
}

async function patchProject(project, repairs) {
  const metadata = project.metadata || {};
  const existing = metadata.churchill_v6_repairs || {};
  const next = {
    ...existing,
    version: VERSION,
    status: "IN_REPAIR",
    master_assembly_allowed: false,
    publication_authorized: false,
    updated_at: new Date().toISOString(),
    scenes: { ...(existing.scenes || {}), ...repairs },
  };
  const { error } = await supabaseAdmin.from("creative_projects").update({ metadata: { ...metadata, churchill_v6_repairs: next }, updated_at: new Date().toISOString() }).eq("id", PROJECT_ID).eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;
}

async function renderAll() {
  const project = await getProject();
  if (project.metadata?.churchill_v6_source_gate?.status !== "ACTIVE") throw new Error("CHURCHILL_V6_SOURCE_GATE_REQUIRED");
  if (project.metadata?.churchill_v6_source_gate?.master_assembly_allowed === true) throw new Error("CHURCHILL_V6_MASTER_MUST_REMAIN_BLOCKED");

  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CHURCHILL_V6_FFMPEG_REQUIRED");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "churchill-v6-hard-repairs-"));

  try {
    const normalizedByKind = {};
    for (const kind of ["dinner", "pool_darts", "band"]) {
      const record = sourceRecord(project, kind);
      const buffer = await downloadVerifiedSource(record);
      normalizedByKind[kind] = {
        record,
        input: await normalizeCreativeStillImage({ input_buffer: buffer, output_directory: directory, name: `source-${kind}` }),
      };
    }

    const repairs = {};
    for (const [sceneKey, contract] of Object.entries(SCENE_CONTRACT)) {
      const source = normalizedByKind[contract.source_kind];
      const output = path.join(directory, `${sceneKey}.mp4`);
      await renderScene(ffmpeg, source.input, sceneKey, contract, output);
      const stored = await uploadOutput(output, sceneKey);
      repairs[sceneKey] = {
        status: "REVIEW_REQUIRED",
        repair_decision: contract.role,
        source_kind: contract.source_kind,
        source_reference: source.record.output_reference,
        source_checksum_sha256: source.record.checksum_sha256,
        source_ai_generated: false,
        output_ai_generated: false,
        still_image_decoder: source.input.decoder,
        ffmpeg_image_decoder_required: source.input.ffmpeg_image_decoder_required,
        generated_venue_allowed: false,
        duration_seconds: contract.duration,
        ...stored,
        approved_for_master: false,
        publication_authorized: false,
        human_review_complete: false,
        repaired_at: new Date().toISOString(),
      };
    }

    await patchProject(project, repairs);
    return { success: true, version: VERSION, repairs };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

async function review(sceneKey) {
  const project = await getProject();
  const record = project.metadata?.churchill_v6_repairs?.scenes?.[sceneKey];
  if (!record?.output_reference) return json({ success: false, error: "CHURCHILL_V6_REPAIR_NOT_RENDERED", scene_key: sceneKey }, 409);
  const prefix = `storage://${BUCKET}/`;
  if (!record.output_reference.startsWith(prefix)) throw new Error("CHURCHILL_V6_REPAIR_REFERENCE_INVALID");
  const storagePath = record.output_reference.slice(prefix.length);
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
    if (action === "render") return json(await renderAll());
    if (action === "review") {
      const scene = text(url.searchParams.get("scene"));
      if (!SCENE_CONTRACT[scene]) return json({ success: false, error: "CHURCHILL_V6_REPAIR_SCENE_UNSUPPORTED" }, 400);
      return review(scene);
    }
    const project = await getProject();
    return json({ success: true, version: VERSION, authentic_sources: project.metadata?.churchill_v6_authentic_sources || null, repairs: project.metadata?.churchill_v6_repairs || null });
  } catch (error) {
    console.error("CHURCHILL_V6_HARD_REJECT_REPAIRS_FAILED", { message: error?.message || String(error), details: error?.details || null });
    return json({ success: false, error: error?.message || String(error), details: error?.details || null }, 500);
  }
}
