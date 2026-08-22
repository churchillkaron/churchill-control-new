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

const TOKEN = "avq-synthetic-intelligence-final-join-20260822-v1";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const BUCKET = "creative-assets";
const GOOGLE_OPENING_PATH = `${ORGANIZATION_ID}/avantiqo-investor-film-20260822/google-veo-opening-v1/synthetic-intelligence-google-veo-take-1.mp4`;
const APPROVED_LOGO_PATH = `${ORGANIZATION_ID}/unassigned/df1cdd49-68e2-4a77-956e-6c9565c0074d-google-veo-6c9upygjkui2.mp4`;
const FINAL_PATH = `${ORGANIZATION_ID}/avantiqo-investor-film-20260822/google-veo-opening-v1/avantiqo-synthetic-intelligence-plus-logo-16s-approved-v1.mp4`;

const supabase = getServiceSupabase();

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

async function download(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`FINAL_JOIN_SOURCE_EMPTY:${storagePath}`);
  await fs.writeFile(localPath, Buffer.from(await data.arrayBuffer()));
}

function run(command, args, timeoutMs = 285000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1" },
    });
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("FINAL_JOIN_EDITOR_TIMEOUT"));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-12000) || `EDITOR_EXIT_${code}`));
        return;
      }
      resolve();
    });
  });
}

async function signedUrl(storagePath, seconds = 86400) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function joinApprovedClips() {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_EDITOR_NOT_READY");

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-final-join-"));
  try {
    const opening = path.join(directory, "google-opening.mp4");
    const logo = path.join(directory, "approved-logo.mp4");
    const openingPrepared = path.join(directory, "google-opening-720p.mp4");
    const logoCopied = path.join(directory, "approved-logo-copy.mp4");
    const concatFile = path.join(directory, "concat.txt");
    const final = path.join(directory, "opening-master-16s.mp4");

    await Promise.all([
      download(GOOGLE_OPENING_PATH, opening),
      download(APPROVED_LOGO_PATH, logo),
    ]);

    // Editorial preparation only: fit the already-approved Google-generated opening
    // to the approved logo master geometry. No synthetic visuals are created here.
    await run(ffmpeg, [
      "-y",
      "-i", opening,
      "-t", "8",
      "-an",
      "-vf", "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24,format=yuv420p",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "17",
      "-r", "24",
      "-movflags", "+faststart",
      openingPrepared,
    ]);

    // Preserve the approved Avantiqo logo video bitstream; remux only, no re-encode.
    await run(ffmpeg, [
      "-y",
      "-i", logo,
      "-t", "8",
      "-map", "0:v:0",
      "-an",
      "-c:v", "copy",
      "-movflags", "+faststart",
      logoCopied,
    ]);

    await fs.writeFile(
      concatFile,
      `file '${openingPrepared.replace(/'/g, "'\\''")}'\nfile '${logoCopied.replace(/'/g, "'\\''")}'\n`,
      "utf8",
    );

    await run(ffmpeg, [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", concatFile,
      "-an",
      "-c:v", "copy",
      "-movflags", "+faststart",
      final,
    ]);

    const bytes = await fs.readFile(final);
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const { error } = await supabase.storage.from(BUCKET).upload(FINAL_PATH, bytes, {
      contentType: "video/mp4",
      cacheControl: "3600",
      upsert: true,
      metadata: {
        organization_id: ORGANIZATION_ID,
        investor_film: "20260822",
        sequence: "synthetic-intelligence-then-approved-avantiqo-logo",
        opening_source_provider: "google-veo",
        opening_source_model: "veo-3.1-generate-preview",
        opening_source_path: GOOGLE_OPENING_PATH,
        approved_logo_source_path: APPROVED_LOGO_PATH,
        approved_logo_video_stream_reencoded: "false",
        approved_logo_video_stream_copy: "true",
        editorial_concat_only: "true",
        generated_visuals_in_join_step: "false",
        publication_authorized: "false",
      },
    });
    if (error) throw error;

    return {
      output_path: FINAL_PATH,
      signed_url: await signedUrl(FINAL_PATH),
      bytes: bytes.length,
      sha256,
      duration_seconds: 16,
      opening_seconds: 8,
      logo_seconds: 8,
      opening_provider: "google-veo",
      opening_model: "veo-3.1-generate-preview",
      approved_logo_video_stream_reencoded: false,
      editorial_concat_only: true,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = String(url.searchParams.get("action") || "status").trim().toLowerCase();

    if (action === "status") {
      return json({
        success: true,
        opening_path: GOOGLE_OPENING_PATH,
        approved_logo_path: APPROVED_LOGO_PATH,
        final_path: FINAL_PATH,
        sequence: ["GOOGLE_VEO_SYNTHETIC_INTELLIGENCE", "APPROVED_AVANTIQO_LOGO"],
        duration_seconds: 16,
        editorial_concat_only: true,
      });
    }

    if (action === "join") {
      return json({ success: true, ...(await joinApprovedClips()) });
    }

    if (action === "signed") {
      return json({ success: true, output_path: FINAL_PATH, signed_url: await signedUrl(FINAL_PATH) });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
