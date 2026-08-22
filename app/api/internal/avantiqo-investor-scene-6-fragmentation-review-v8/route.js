export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const TOKEN = "avq-investor-scene-6-fragmentation-review-v8-20260822";
const CONTRACT = "AVANTIQO_INVESTOR_SCENE_6_FRAGMENTATION_REVIEW_V8";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const W = 1920;
const H = 1080;
const FPS = 24;
const DURATION = 7.6;
const CREATIVE = 1.52;
const KEEP = DURATION - CREATIVE;

const SOURCE_V6 = `${ORG}/${PROJECT}/scene-previews-20260822/scene-06-fragmentation-review-v6.mp4`;
const MANAGER = `${ORG}/unassigned/b1f518b9-e1da-4153-a665-93d1768b42f3-gemini-5sts8qv981mh.mp4`;
const OUTPUT = `${ORG}/${PROJECT}/scene-previews-20260822/scene-06-fragmentation-review-v8.mp4`;

const supabase = getServiceSupabase();

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

function run(command, args, timeoutMs = 285000) {
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
        reject(new Error("SCENE_6_V8_TIMEOUT"));
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
      else resolve(out);
    });
  });
}

async function download(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`SCENE_6_V8_SOURCE_EMPTY:${storagePath}`);
  await fs.writeFile(localPath, Buffer.from(await data.arrayBuffer()));
}

async function exists(storagePath) {
  const directory = path.posix.dirname(storagePath);
  const filename = path.posix.basename(storagePath);
  const { data, error } = await supabase.storage.from(BUCKET).list(directory, { search: filename, limit: 10 });
  if (error) return false;
  return (data || []).some((row) => row.name === filename);
}

async function signedUrl(storagePath, seconds = 86400) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function svgToRaw(directory, name, svg) {
  const bytes = await sharp(svg).resize(W, H).ensureAlpha().raw().toBuffer();
  const target = path.join(directory, `${name}.rgba`);
  await fs.writeFile(target, bytes);
  return target;
}

function creativeGlassSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="glassEdge" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.60"/>
        <stop offset="0.32" stop-color="#dfe4ea" stop-opacity="0.15"/>
        <stop offset="0.74" stop-color="#ffffff" stop-opacity="0.06"/>
        <stop offset="1" stop-color="#d6a66a" stop-opacity="0.38"/>
      </linearGradient>
      <linearGradient id="glassFill" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.030"/>
        <stop offset="0.52" stop-color="#ffffff" stop-opacity="0.008"/>
        <stop offset="1" stop-color="#d6a66a" stop-opacity="0.018"/>
      </linearGradient>
      <linearGradient id="ribbonA" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.06"/>
        <stop offset="0.34" stop-color="#e5e8eb" stop-opacity="0.28"/>
        <stop offset="0.64" stop-color="#8f949a" stop-opacity="0.12"/>
        <stop offset="1" stop-color="#d6a66a" stop-opacity="0.42"/>
      </linearGradient>
      <linearGradient id="ribbonB" x1="1" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#d6a66a" stop-opacity="0.18"/>
        <stop offset="0.44" stop-color="#f0f2f4" stop-opacity="0.20"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0.02"/>
      </linearGradient>
      <radialGradient id="glow" cx="34%" cy="38%" r="64%">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.07"/>
        <stop offset="0.34" stop-color="#d6a66a" stop-opacity="0.06"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
      <filter id="soft"><feGaussianBlur stdDeviation="18"/></filter>
    </defs>

    <ellipse cx="700" cy="470" rx="590" ry="390" fill="url(#glow)" filter="url(#soft)"/>

    <g transform="translate(120 92) rotate(-0.8 670 390)">
      <rect width="1340" height="780" rx="42" fill="url(#glassFill)" stroke="url(#glassEdge)" stroke-width="1.6"/>
      <path d="M70 84 C420 30 900 34 1276 100" fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="1.1"/>
      <path d="M84 700 C420 752 938 742 1260 670" fill="none" stroke="#d6a66a" stroke-opacity="0.11" stroke-width="1.2"/>

      <path d="M180 640 C328 512 410 340 604 186 C742 78 914 84 1114 156 C940 210 790 330 664 498 C534 670 368 730 180 640 Z" fill="url(#ribbonA)"/>
      <path d="M236 676 C410 564 498 442 612 324 C750 180 946 154 1180 238 C954 248 808 348 696 482 C574 628 430 714 236 676 Z" fill="url(#ribbonB)"/>

      <path d="M260 662 C466 580 584 462 704 334 C840 192 1004 164 1174 214" fill="none" stroke="#ffffff" stroke-opacity="0.34" stroke-width="2.1"/>
      <path d="M300 700 C518 622 644 500 760 386 C888 258 1028 220 1196 250" fill="none" stroke="#d6a66a" stroke-opacity="0.38" stroke-width="2.0"/>

      <g transform="translate(920 245)">
        <path d="M0 0 L38 88 L84 0 L122 88 L160 0" fill="none" stroke="#f4efe6" stroke-opacity="0.82" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M8 132 H154" stroke="#d6a66a" stroke-opacity="0.74" stroke-width="2.2"/>
        <path d="M24 168 H138" stroke="#ffffff" stroke-opacity="0.28" stroke-width="1.2"/>
      </g>
    </g>
  </svg>`);
}

async function upload(localPath) {
  const bytes = await fs.readFile(localPath);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const { error } = await supabase.storage.from(BUCKET).upload(OUTPUT, bytes, {
    contentType: "video/mp4",
    cacheControl: "3600",
    upsert: true,
    metadata: {
      contract: CONTRACT,
      organization_id: ORG,
      creative_project_id: PROJECT,
      scene: "6",
      narration: "Customers, staff, suppliers, conversations, campaigns and creative work all lived in different systems.",
      duration_seconds: String(DURATION),
      unchanged_before_seconds: String(KEEP),
      final_creative_seconds: String(CREATIVE),
      creative_treatment: "FRAMELESS_OPTICAL_GLASS_LIGHT_AND_MATERIAL_CAMPAIGN",
      central_object_present: "false",
      orb_present: "false",
      black_panel: "false",
      card_present: "false",
      text_boxes_present: "false",
      real_world_visible_through_glass: "true",
      no_fake_ui: "true",
      no_churchill: "true",
      publication_authorized: "false",
      sha256,
    },
  });
  if (error) throw error;
  return { bytes: bytes.length, sha256 };
}

async function render() {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_EDITOR_NOT_READY");

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-scene6-v8-"));
  try {
    const source = path.join(directory, "scene6-v6.mp4");
    const manager = path.join(directory, "manager.mp4");
    const first = path.join(directory, "first.mp4");
    const creative = path.join(directory, "creative.mp4");
    const picture = path.join(directory, "picture.mp4");
    const final = path.join(directory, "scene6-v8.mp4");

    await Promise.all([download(SOURCE_V6, source), download(MANAGER, manager)]);
    const overlay = await svgToRaw(directory, "creative-optical-glass-v8", creativeGlassSvg());

    await run(ffmpeg, [
      "-y", "-i", source,
      "-t", String(KEEP),
      "-an",
      "-c:v", "libx264", "-preset", "fast", "-crf", "16",
      "-pix_fmt", "yuv420p", "-r", String(FPS),
      first,
    ]);

    await run(ffmpeg, [
      "-y",
      "-ss", "3.10",
      "-stream_loop", "-1", "-i", manager,
      "-stream_loop", "-1",
      "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${W}x${H}`, "-framerate", String(FPS), "-i", overlay,
      "-t", String(CREATIVE),
      "-filter_complex",
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},eq=contrast=1.02:brightness=-0.004:saturation=0.92,format=yuv420p[b];[1:v]format=rgba[o];[b][o]overlay=x='1.5*sin(t*0.46)':y='1.0*sin(t*0.34)':shortest=1,format=yuv420p[v]`,
      "-map", "[v]", "-an",
      "-c:v", "libx264", "-preset", "fast", "-crf", "16",
      "-pix_fmt", "yuv420p", "-r", String(FPS),
      creative,
    ]);

    const list = path.join(directory, "concat.txt");
    await fs.writeFile(list, [first, creative].map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
    await run(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-an", "-c:v", "copy", picture]);

    await run(ffmpeg, [
      "-y", "-i", picture, "-i", source,
      "-map", "0:v:0", "-map", "1:a:0",
      "-t", String(DURATION),
      "-c:v", "copy", "-c:a", "copy",
      "-movflags", "+faststart",
      final,
    ]);

    const stored = await upload(final);
    return {
      success: true,
      contract: CONTRACT,
      scene: 6,
      duration_seconds: DURATION,
      unchanged_before_seconds: KEEP,
      final_creative_seconds: CREATIVE,
      output_ready: true,
      output_path: OUTPUT,
      signed_url: await signedUrl(OUTPUT),
      rules: {
        central_object_present: false,
        orb_present: false,
        black_panel: false,
        card_present: false,
        text_boxes_present: false,
        optical_glass: true,
        real_world_visible: true,
        no_fake_ui: true,
        no_churchill: true,
      },
      ...stored,
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
    if (action === "render") return json(await render());
    const ready = await exists(OUTPUT);
    if (action === "signed") return json({ success: true, output_ready: ready, output_path: OUTPUT, signed_url: ready ? await signedUrl(OUTPUT) : null });
    if (action === "status") return json({ success: true, contract: CONTRACT, scene: 6, output_ready: ready, output_path: OUTPUT });
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, contract: CONTRACT, error: error?.message || String(error) }, 500);
  }
}
