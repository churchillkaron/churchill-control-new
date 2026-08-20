export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const TOKEN = "avq-investor-opening-no-loop-20260821";
const BUCKET = "creative-assets";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const OUT = `${ORG}/avantiqo-investor-film-20260820/segments/opening-final-v2.mp4`;
const LOGO = `${ORG}/unassigned/df1cdd49-68e2-4a77-956e-6c9565c0074d-google-veo-6c9upygjkui2.mp4`;
const FOUNDER = `${ORG}/avantiqo-investor-film-20260820/founder-v7/founder-opening-origin-synced-approved-v7.mp4`;
const B01 = `${ORG}/unassigned/7fb49565-ee64-4fc5-b336-64cb334fb758-gemini-tylp0qmz2bpi.mp4`;
const B02 = `${ORG}/unassigned/8fce813d-68ac-4032-918e-0eee89871265-gemini-q1zghwo9x4g8.mp4`;
const B03 = `${ORG}/unassigned/5a56a041-3f60-47ff-a67b-bb011db8874c-gemini-qwgea6koo5yg.mp4`;
const B04 = `${ORG}/unassigned/752d3d33-c62c-402c-8459-62b04a9e4010-gemini-urre56o4cv2u.mp4`;
const B05 = `${ORG}/unassigned/68fdaca9-8d0f-46c9-ac86-8a639a593b57-gemini-kh6kptlc7phe.mp4`;
const W = 1280;
const H = 720;
const FPS = 24;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

function run(command, args, timeoutMs = 290000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, OMP_NUM_THREADS: "1" } });
    const stderr = [];
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("OPENING_NO_LOOP_TIMEOUT")); }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-12000) || `FFMPEG_EXIT_${code}`));
      else resolve(true);
    });
  });
}

async function download(storagePath, localPath) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`OPENING_SOURCE_EMPTY:${storagePath}`);
  await fs.writeFile(localPath, Buffer.from(await data.arrayBuffer()));
}

async function upload(storagePath, localPath) {
  const bytes = await fs.readFile(localPath);
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
    metadata: {
      investor_film: "20260820",
      opening_edit: "NO_FOUNDER_LOOP_V3",
      founder_visible_seconds: "10.0",
      founder_repeat: "false",
    },
  });
  if (error) throw error;
  return { bytes: bytes.length };
}

async function signedUrl(storagePath) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, 86400);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function renderClip(ffmpeg, sourcePath, localPath, duration, trimStart = 0) {
  const source = `${localPath}.source.mp4`;
  await download(sourcePath, source);
  const args = ["-y"];
  if (trimStart > 0) args.push("-ss", String(trimStart));
  args.push(
    "-i", source,
    "-t", String(duration),
    "-an",
    "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},format=yuv420p`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", localPath,
  );
  await run(ffmpeg, args);
}

async function concat(ffmpeg, clips, output, directory) {
  const list = path.join(directory, "opening-no-loop.concat.txt");
  await fs.writeFile(list, clips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
  await run(ffmpeg, [
    "-y", "-f", "concat", "-safe", "0", "-i", list, "-an",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", output,
  ]);
}

async function render() {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-opening-no-loop-"));
  try {
    const spec = [
      [LOGO, 8, 0, "00-logo"],
      [FOUNDER, 10, 0, "01-founder"],
      [B01, 1.391, 0, "02-bridge"],
      [B01, 6.609, 1.391, "03-world"],
      [B02, 6.6, 0, "04-fractured"],
      [B03, 5.775, 0, "05-reveal"],
      [B04, 7.172, 0, "06-intelligence"],
      [B05, 2.531, 0, "07-why"],
    ];
    const clips = [];
    for (const [source, duration, start, name] of spec) {
      const clip = path.join(dir, `${name}.mp4`);
      await renderClip(ffmpeg, source, clip, duration, start);
      clips.push(clip);
    }
    const output = path.join(dir, "opening-final-v3-no-loop.mp4");
    await concat(ffmpeg, clips, output, dir);
    const stored = await upload(OUT, output);
    return {
      success: true,
      output_path: OUT,
      bytes: stored.bytes,
      signed_url: await signedUrl(OUT),
      founder_loop: false,
      founder_visible_seconds: 10,
      bridge_seconds: 1.391,
      total_seconds: 48.078,
    };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = url.searchParams.get("action") || "status";
    if (action === "status") return json({ success: true, policy: "NO_FOUNDER_LOOP", founder_visible_seconds: 10, bridge_seconds: 1.391, output_path: OUT });
    if (action === "render") return json(await render());
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
