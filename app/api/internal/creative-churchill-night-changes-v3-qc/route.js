export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

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
const TOKEN = "churchill-night-changes-v3-qc-20260821";
const BUCKET = "creative-assets";
const SHOTS = new Set([
  "wine_universe",
  "steam_into_bar",
  "ice_time_freeze",
  "pool_to_shuffleboard",
  "shuffleboard_to_dart",
  "electric_dart_flight",
  "frozen_night_hero",
]);

function text(value) {
  return String(value ?? "").trim();
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

function run(command, args, timeoutMs = 90000) {
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
        reject(new Error("CHURCHILL_V3_QC_TIMEOUT"));
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
      else reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-12000) || `CHURCHILL_V3_QC_FFMPEG_${code}`));
    });
  });
}

function storagePath(reference) {
  const value = text(reference);
  const prefix = `storage://${BUCKET}/`;
  if (!value.startsWith(prefix)) throw new Error("CHURCHILL_V3_QC_STORAGE_REFERENCE_REQUIRED");
  return value.slice(prefix.length);
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
  if (!mission?.id) throw new Error("CHURCHILL_V3_QC_MISSION_REQUIRED");

  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("id,metadata")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("creative_mission_id", mission.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V3_QC_PROJECT_REQUIRED");
  if (data.metadata?.canonical_story_version !== CHURCHILL_NIGHT_CHANGES_STORY_VERSION) {
    throw new Error("CHURCHILL_V3_QC_STORY_VERSION_MISMATCH");
  }
  return data;
}

async function shotState(shot) {
  if (!SHOTS.has(shot)) throw new Error("CHURCHILL_V3_QC_SHOT_INVALID");
  const p = await project();
  const state = p.metadata?.churchill_v3_vfx?.shots?.[shot] || null;
  if (state?.status !== "COMPLETED" || !state?.output_reference) {
    throw new Error(`CHURCHILL_V3_QC_SHOT_NOT_READY:${shot}`);
  }
  return { project: p, state };
}

async function downloadShot(reference, target) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(storagePath(reference));
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V3_QC_MEDIA_EMPTY");
  await fs.writeFile(target, Buffer.from(await data.arrayBuffer()));
}

async function extractFrame(ffmpeg, video, target, seconds) {
  await run(ffmpeg, [
    "-y",
    "-ss", seconds.toFixed(3),
    "-i", video,
    "-frames:v", "1",
    "-vf", "scale=480:270:force_original_aspect_ratio=increase,crop=480:270",
    "-q:v", "2",
    target,
  ], 60000);
}

function labelSvg(label) {
  const safe = label.replace(/[&<>\"]/g, "");
  return Buffer.from(`<svg width="480" height="270" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="10" width="132" height="30" rx="8" fill="rgba(0,0,0,0.68)"/><text x="22" y="31" font-family="Arial,Helvetica,sans-serif" font-size="16" fill="white">${safe}</text></svg>`);
}

async function sheet(shot) {
  const { project: p, state } = await shotState(shot);
  const duration = Number(state.duration_seconds || 0);
  if (!(duration > 0)) throw new Error("CHURCHILL_V3_QC_DURATION_REQUIRED");
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CHURCHILL_V3_QC_FFMPEG_NOT_READY");

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), `churchill-v3-qc-${shot}-`));
  try {
    const source = path.join(directory, `${shot}.mp4`);
    await downloadShot(state.output_reference, source);
    const fractions = [0.18, 0.40, 0.62, 0.84];
    const frames = [];
    for (let index = 0; index < fractions.length; index += 1) {
      const seconds = Math.min(Math.max(0.05, duration * fractions[index]), Math.max(0.05, duration - 0.08));
      const raw = path.join(directory, `frame-${index + 1}.jpg`);
      await extractFrame(ffmpeg, source, raw, seconds);
      const framed = await sharp(raw)
        .composite([{ input: labelSvg(`${seconds.toFixed(2)}s`), top: 0, left: 0 }])
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
      frames.push(framed);
    }

    const background = {
      create: { width: 960, height: 540, channels: 3, background: "#090909" },
    };
    const contactSheet = await sharp(background)
      .composite([
        { input: frames[0], left: 0, top: 0 },
        { input: frames[1], left: 480, top: 0 },
        { input: frames[2], left: 0, top: 270 },
        { input: frames[3], left: 480, top: 270 },
      ])
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();

    return {
      buffer: contactSheet,
      project_id: p.id,
      shot,
      duration_seconds: duration,
      provider_job_id: state.provider_job_id || null,
      output_reference: state.output_reference,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

async function status() {
  const p = await project();
  const states = p.metadata?.churchill_v3_vfx?.shots || {};
  return {
    success: true,
    creative_project_id: p.id,
    canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
    sheets: Object.fromEntries([...SHOTS].map((shot) => [shot, {
      ready: states[shot]?.status === "COMPLETED" && Boolean(states[shot]?.output_reference),
      duration_seconds: states[shot]?.duration_seconds || null,
      provider_job_id: states[shot]?.provider_job_id || null,
    }])),
    publication_authorized: false,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    if (action === "status") return json(await status());
    if (action === "sheet") {
      const shot = text(url.searchParams.get("shot"));
      const result = await sheet(shot);
      return new Response(result.buffer, {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Length": String(result.buffer.length),
          "Cache-Control": "no-store, private",
          "X-Churchill-QC-Shot": result.shot,
          "X-Churchill-QC-Project": result.project_id,
        },
      });
    }
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("CHURCHILL_V3_QC_FAILED", {
      message: error?.message || String(error),
      details: error?.details || null,
    });
    return json({ success: false, error: error?.message || String(error), details: error?.details || null }, 500);
  }
}
