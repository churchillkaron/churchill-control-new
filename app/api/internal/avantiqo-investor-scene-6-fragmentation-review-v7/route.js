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

const TOKEN = "avq-investor-scene-6-fragmentation-review-v7-20260822";
const CONTRACT = "AVANTIQO_INVESTOR_SCENE_6_FRAGMENTATION_REVIEW_V7";
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
const OUTPUT = `${ORG}/${PROJECT}/scene-previews-20260822/scene-06-fragmentation-review-v7.mp4`;

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
        reject(new Error("SCENE_6_V7_TIMEOUT"));
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
  if (!data) throw new Error(`SCENE_6_V7_SOURCE_EMPTY:${storagePath}`);
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
      <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.72"/>
        <stop offset="0.30" stop-color="#dfe4e9" stop-opacity="0.16"/>
        <stop offset="0.72" stop-color="#ffffff" stop-opacity="0.08"/>
        <stop offset="1" stop-color="#d6a66a" stop-opacity="0.48"/>
      </linearGradient>
      <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.055"/>
        <stop offset="0.34" stop-color="#cbd1d7" stop-opacity="0.018"/>
        <stop offset="0.70" stop-color="#ffffff" stop-opacity="0.010"/>
        <stop offset="1" stop-color="#d6a66a" stop-opacity="0.026"/>
      </linearGradient>
      <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f7f4ed" stop-opacity="0.96"/>
        <stop offset="0.20" stop-color="#b8bec5" stop-opacity="0.92"/>
        <stop offset="0.47" stop-color="#252a2f" stop-opacity="0.94"/>
        <stop offset="0.70" stop-color="#d6a66a" stop-opacity="0.95"/>
        <stop offset="1" stop-color="#08090b" stop-opacity="0.98"/>
      </linearGradient>
      <radialGradient id="aura" cx="38%" cy="40%" r="62%">
        <stop offset="0" stop-color="#d6a66a" stop-opacity="0.11"/>
        <stop offset="0.52" stop-color="#ffffff" stop-opacity="0.025"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
      <filter id="soft"><feGaussianBlur stdDeviation="24"/></filter>
    </defs>

    <ellipse cx="700" cy="488" rx="590" ry="380" fill="url(#aura)" filter="url(#soft)"/>

    <g transform="translate(118 92) rotate(-1.0 665 390)">
      <rect width="1330" height="780" rx="40" fill="url(#glass)" stroke="url(#edge)" stroke-width="1.8"/>
      <path d="M42 64 C430 18 914 22 1284 94" fill="none" stroke="#ffffff" stroke-opacity="0.11" stroke-width="1.2"/>
      <path d="M80 724 C416 772 946 758 1268 682" fill="none" stroke="#d6a66a" stroke-opacity="0.13" stroke-width="1.2"/>

      <g transform="translate(350 396)">
        <ellipse cx="0" cy="0" rx="164" ry="236" fill="url(#metal)"/>
        <ellipse cx="-24" cy="-16" rx="112" ry="178" fill="#050608" fill-opacity="0.43"/>
        <path d="M-82 -150 C-22 -218 82 -204 126 -108" fill="none" stroke="#ffffff" stroke-opacity="0.42" stroke-width="4"/>
        <path d="M-112 158 C-38 232 74 216 126 122" fill="none" stroke="#d6a66a" stroke-opacity="0.50" stroke-width="5"/>
      </g>

      <text x="674" y="330" fill="#f4efe7" fill-opacity="0.96" font-family="Georgia, 'Times New Roman', serif" font-size="82" letter-spacing="10">NOCTURNE</text>
      <text x="682" y="395" fill="#d6a66a" fill-opacity="0.94" font-family="Arial, Helvetica, sans-serif" font-size="20" letter-spacing="8">A NEW STANDARD</text>
      <line x1="682" y1="438" x2="1112" y2="438" stroke="#ffffff" stroke-opacity="0.20"/>
      <text x="682" y="494" fill="#ffffff" fill-opacity="0.70" font-family="Arial, Helvetica, sans-serif" font-size="18" letter-spacing="4">FILM  ·  SOCIAL  ·  CAMPAIGN</text>
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
      creative_treatment: "FRAMELESS_TRANSPARENT_OPTICAL_GLASS_OVER_REAL_WORLD",
      real_world_visible_through_glass: "true",
      opaque_card: "false",
      black_panel: "false",
      architecture_audit_blockers_cleared: "true",
      no_orb: "true",
      no_pills: "true",
      no_dashboard_cards: "true",
      no_browser_chrome: "true",
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

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-scene6-v7-"));
  try {
    const source = path.join(directory, "scene6-v6.mp4");
    const manager = path.join(directory, "manager.mp4");
    const first = path.join(directory, "first.mp4");
    const creative = path.join(directory, "creative.mp4");
    const picture = path.join(directory, "picture.mp4");
    const final = path.join(directory, "scene6-v7.mp4");

    await Promise.all([download(SOURCE_V6, source), download(MANAGER, manager)]);
    const overlay = await svgToRaw(directory, "creative-optical-glass", creativeGlassSvg());

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
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},eq=contrast=1.025:brightness=-0.006:saturation=0.91,format=yuv420p[b];[1:v]format=rgba[o];[b][o]overlay=x='2.2*sin(t*0.42)':y='1.6*sin(t*0.33)':shortest=1,format=yuv420p[v]`,
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
        optical_glass: true,
        real_world_visible: true,
        opaque_card: false,
        black_panel: false,
        no_orb: true,
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
