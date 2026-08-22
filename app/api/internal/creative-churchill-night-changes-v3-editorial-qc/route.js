export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "da38f668-11a1-4760-a8f2-6adc3effdab5";
const TOKEN = "churchill-v3-editorial-qc-20260822";
const BUCKET = "creative-assets";

const BEATS = Object.freeze({
  ice: "ice_time_freeze_authentic_pool_landing",
  wine: "wine_loop_return_authentic_payoff",
});

function text(value) {
  return String(value ?? "").trim();
}

function run(command, args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        reject(new Error("CHURCHILL_EDITORIAL_QC_TIMEOUT"));
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
      else reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-12000) || `CHURCHILL_EDITORIAL_QC_EXIT_${code}`));
    });
  });
}

function storagePath(reference) {
  const value = text(reference);
  const prefix = `storage://${BUCKET}/`;
  if (value.startsWith(prefix)) return value.slice(prefix.length);
  return null;
}

async function signedUrl(reference) {
  const objectPath = storagePath(reference);
  if (!objectPath) throw new Error("CHURCHILL_EDITORIAL_QC_STORAGE_REFERENCE_REQUIRED");
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(objectPath, 3600);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("CHURCHILL_EDITORIAL_QC_SIGNED_URL_REQUIRED");
  return data.signedUrl;
}

async function outputFor(key) {
  const beat = BEATS[key];
  if (!beat) throw new Error("CHURCHILL_EDITORIAL_QC_UNKNOWN_BEAT");
  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("metadata")
    .eq("id", PROJECT_ID)
    .eq("organization_id", ORGANIZATION_ID)
    .maybeSingle();
  if (error) throw error;
  const node = data?.metadata?.churchill_v3_editorial?.outputs?.[beat] || null;
  if (!node?.output_reference || node?.technical_render_complete !== true) {
    throw new Error(`CHURCHILL_EDITORIAL_QC_OUTPUT_NOT_READY:${beat}`);
  }
  return { beat, node };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return new Response("Not found", { status: 404 });
    const key = text(url.searchParams.get("beat") || "ice").toLowerCase();
    const { beat, node } = await outputFor(key);
    const sourceUrl = await signedUrl(node.output_reference);
    const ffmpeg = resolveCreativeFfmpegPath();
    if (!ffmpeg) throw new Error("CHURCHILL_EDITORIAL_QC_FFMPEG_REQUIRED");

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "churchill-editorial-qc-"));
    const output = path.join(dir, `${key}-contact-sheet.jpg`);
    try {
      await run(ffmpeg, [
        "-y",
        "-i", sourceUrl,
        "-vf", "fps=1.5,scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2,tile=3x2",
        "-frames:v", "1",
        "-q:v", "2",
        output,
      ]);
      const buffer = await fs.readFile(output);
      return new Response(buffer, {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "cache-control": "no-store, private",
          "content-disposition": `inline; filename=churchill-${beat}-qc.jpg`,
          "x-churchill-editorial-beat": beat,
          "x-churchill-editorial-review-status": text(node.status || "REVIEW_REQUIRED"),
        },
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  } catch (error) {
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
}
