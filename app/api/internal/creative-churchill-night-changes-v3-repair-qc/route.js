export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import {
  CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
  assertChurchillNightStoryIntegrity,
} from "@/lib/creative/concepts/ChurchillNightChangesStoryContract";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const COMMAND_IDENTITY = "CHURCHILL_THE_NIGHT_INSIDE_THE_NIGHT_90S_V3";
const TOKEN = "churchill-night-changes-v3-repair-qc-20260821";
const BUCKET = "creative-assets";
const REPAIR_VERSION = "CHURCHILL_V3_REPAIR_R1_AUTHENTIC_GEOMETRY";
const SHOTS = new Set(["shuffleboard_to_dart", "electric_dart_flight"]);
const FRAME_W = 220;
const FRAME_H = 124;
const COLS = 3;
const ROWS = 2;
const FRACTIONS = [0.08, 0.25, 0.42, 0.59, 0.76, 0.93];

function text(value) {
  return String(value ?? "").trim();
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

function storagePath(reference) {
  const value = text(reference);
  const prefix = `storage://${BUCKET}/`;
  if (!value.startsWith(prefix)) throw new Error("CHURCHILL_V3_REPAIR_QC_STORAGE_REFERENCE_REQUIRED");
  return value.slice(prefix.length);
}

function run(command, args, timeoutMs = 60000) {
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
        reject(new Error("CHURCHILL_V3_REPAIR_QC_TIMEOUT"));
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
      if (code === 0) resolve();
      else reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-8000) || `CHURCHILL_V3_REPAIR_QC_FFMPEG_${code}`));
    });
  });
}

async function project() {
  assertChurchillNightStoryIntegrity();
  const { data: mission, error: missionError } = await supabaseAdmin
    .from("creative_missions")
    .select("id")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("metadata->>command_identity", COMMAND_IDENTITY)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (missionError) throw missionError;
  if (!mission?.id) throw new Error("CHURCHILL_V3_REPAIR_QC_MISSION_REQUIRED");

  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("id,metadata")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("creative_mission_id", mission.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V3_REPAIR_QC_PROJECT_REQUIRED");
  if (data.metadata?.canonical_story_version !== CHURCHILL_NIGHT_CHANGES_STORY_VERSION) {
    throw new Error("CHURCHILL_V3_REPAIR_QC_STORY_VERSION_MISMATCH");
  }
  return data;
}

async function stateFor(shot) {
  if (!SHOTS.has(shot)) throw new Error("CHURCHILL_V3_REPAIR_QC_SHOT_INVALID");
  const p = await project();
  const repairs = p.metadata?.churchill_v3_repairs || {};
  if (repairs.version !== REPAIR_VERSION) throw new Error("CHURCHILL_V3_REPAIR_QC_VERSION_MISMATCH");
  const state = repairs.generations?.[shot] || null;
  if (state?.status !== "COMPLETED" || !state?.output_reference) {
    throw new Error(`CHURCHILL_V3_REPAIR_QC_NOT_READY:${shot}`);
  }
  return { p, state };
}

async function download(reference, target) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(storagePath(reference));
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V3_REPAIR_QC_EMPTY_MEDIA");
  await fs.writeFile(target, Buffer.from(await data.arrayBuffer()));
}

async function frame(ffmpeg, source, target, seconds) {
  await run(ffmpeg, [
    "-y",
    "-ss", seconds.toFixed(3),
    "-i", source,
    "-frames:v", "1",
    "-vf", `scale=${FRAME_W}:${FRAME_H}:force_original_aspect_ratio=increase,crop=${FRAME_W}:${FRAME_H}`,
    "-q:v", "4",
    target,
  ]);
}

function labelSvg(label) {
  const safe = label.replace(/[&<>\"]/g, "");
  return Buffer.from(`<svg width="${FRAME_W}" height="${FRAME_H}" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="5" width="62" height="20" rx="5" fill="rgba(0,0,0,0.72)"/><text x="11" y="19" font-family="Arial,Helvetica,sans-serif" font-size="11" fill="white">${safe}</text></svg>`);
}

async function sheet(shot) {
  const { p, state } = await stateFor(shot);
  const duration = Number(state.duration_seconds || 0);
  if (!(duration > 0)) throw new Error("CHURCHILL_V3_REPAIR_QC_DURATION_REQUIRED");
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CHURCHILL_V3_REPAIR_QC_FFMPEG_REQUIRED");

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `churchill-repair-qc-${shot}-`));
  try {
    const source = path.join(dir, `${shot}.mp4`);
    await download(state.output_reference, source);
    const frames = [];
    const timestamps = [];
    for (let i = 0; i < FRACTIONS.length; i += 1) {
      const seconds = Math.min(Math.max(0.03, duration * FRACTIONS[i]), Math.max(0.03, duration - 0.04));
      const raw = path.join(dir, `frame-${i}.jpg`);
      await frame(ffmpeg, source, raw, seconds);
      const jpeg = await sharp(raw)
        .composite([{ input: labelSvg(`${seconds.toFixed(2)}s`), left: 0, top: 0 }])
        .jpeg({ quality: 58, mozjpeg: true })
        .toBuffer();
      frames.push(jpeg);
      timestamps.push(Number(seconds.toFixed(3)));
    }

    const width = FRAME_W * COLS;
    const height = FRAME_H * ROWS;
    const composites = frames.map((input, i) => ({
      input,
      left: (i % COLS) * FRAME_W,
      top: Math.floor(i / COLS) * FRAME_H,
    }));
    const contact = await sharp({ create: { width, height, channels: 3, background: "#050505" } })
      .composite(composites)
      .jpeg({ quality: 58, mozjpeg: true })
      .toBuffer();

    return {
      success: true,
      shot,
      project_id: p.id,
      duration_seconds: duration,
      timestamps,
      width,
      height,
      jpeg_bytes: contact.length,
      jpeg_base64: contact.toString("base64"),
    };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const shot = text(url.searchParams.get("shot"));
    return json(await sheet(shot));
  } catch (error) {
    console.error("CHURCHILL_V3_REPAIR_QC_FAILED", { message: error?.message || String(error) });
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
