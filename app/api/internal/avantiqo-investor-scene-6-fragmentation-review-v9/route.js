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

const TOKEN = "avq-investor-scene-6-fragmentation-review-v9-20260822";
const CONTRACT = "AVANTIQO_INVESTOR_SCENE_6_FRAGMENTATION_REVIEW_V9";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const W = 1920;
const H = 1080;
const FPS = 24;
const DURATION = 7.6;
const ADS = 1.52;
const KEEP = DURATION - ADS;
const AD_A_SECONDS = 0.76;
const AD_B_SECONDS = ADS - AD_A_SECONDS;

const SOURCE_V6 = `${ORG}/${PROJECT}/scene-previews-20260822/scene-06-fragmentation-review-v6.mp4`;
const MANAGER = `${ORG}/unassigned/b1f518b9-e1da-4153-a665-93d1768b42f3-gemini-5sts8qv981mh.mp4`;
const OUTPUT = `${ORG}/${PROJECT}/scene-previews-20260822/scene-06-fragmentation-review-v9.mp4`;

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
        reject(new Error("SCENE_6_V9_TIMEOUT"));
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
  if (!data) throw new Error(`SCENE_6_V9_SOURCE_EMPTY:${storagePath}`);
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

function glassDefs() {
  return `<defs>
    <linearGradient id="glassEdge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.62"/>
      <stop offset="0.30" stop-color="#dfe4e9" stop-opacity="0.15"/>
      <stop offset="0.74" stop-color="#ffffff" stop-opacity="0.055"/>
      <stop offset="1" stop-color="#d6a66a" stop-opacity="0.40"/>
    </linearGradient>
    <linearGradient id="glassFill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.034"/>
      <stop offset="0.50" stop-color="#ffffff" stop-opacity="0.006"/>
      <stop offset="1" stop-color="#d6a66a" stop-opacity="0.020"/>
    </linearGradient>
    <linearGradient id="metalLine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="0.34" stop-color="#f2f3f4" stop-opacity="0.92"/>
      <stop offset="0.62" stop-color="#a9afb6" stop-opacity="0.70"/>
      <stop offset="1" stop-color="#d6a66a" stop-opacity="0.88"/>
    </linearGradient>
    <linearGradient id="champagne" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f5efe4" stop-opacity="0.10"/>
      <stop offset="0.40" stop-color="#e7dac2" stop-opacity="0.36"/>
      <stop offset="0.72" stop-color="#d6a66a" stop-opacity="0.56"/>
      <stop offset="1" stop-color="#42382a" stop-opacity="0.08"/>
    </linearGradient>
    <radialGradient id="softGlow" cx="38%" cy="42%" r="62%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.075"/>
      <stop offset="0.42" stop-color="#d6a66a" stop-opacity="0.045"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="20"/></filter>
  </defs>`;
}

function adAutomotiveSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${glassDefs()}
    <ellipse cx="690" cy="472" rx="610" ry="392" fill="url(#softGlow)" filter="url(#blur)"/>
    <g transform="translate(118 92) rotate(-0.8 670 390)">
      <rect width="1340" height="780" rx="42" fill="url(#glassFill)" stroke="url(#glassEdge)" stroke-width="1.6"/>
      <path d="M76 84 C432 30 906 34 1272 98" fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="1.1"/>
      <path d="M84 706 C430 750 938 742 1256 674" fill="none" stroke="#d6a66a" stroke-opacity="0.12" stroke-width="1.2"/>

      <g transform="translate(114 250)">
        <path d="M26 262 C128 170 244 112 402 92 C554 72 684 112 810 184 C888 230 940 254 1010 266" fill="none" stroke="url(#metalLine)" stroke-width="5" stroke-linecap="round"/>
        <path d="M86 266 C162 282 244 292 340 294 H750 C836 294 904 286 980 266" fill="none" stroke="#ffffff" stroke-opacity="0.36" stroke-width="2"/>
        <path d="M240 126 C330 124 414 128 512 150 C584 166 648 194 712 228" fill="none" stroke="#d6a66a" stroke-opacity="0.55" stroke-width="3"/>
        <ellipse cx="276" cy="292" rx="76" ry="17" fill="#d6a66a" fill-opacity="0.09"/>
        <ellipse cx="812" cy="292" rx="76" ry="17" fill="#ffffff" fill-opacity="0.06"/>
      </g>

      <text x="800" y="236" fill="#f7f3ec" fill-opacity="0.96" font-family="Georgia, 'Times New Roman', serif" font-size="76" letter-spacing="11">AURELIS</text>
      <text x="808" y="294" fill="#d6a66a" fill-opacity="0.92" font-family="Arial, Helvetica, sans-serif" font-size="18" letter-spacing="7">THE NEXT HORIZON</text>
      <line x1="808" y1="330" x2="1190" y2="330" stroke="#ffffff" stroke-opacity="0.18"/>
      <text x="808" y="372" fill="#ffffff" fill-opacity="0.62" font-family="Arial, Helvetica, sans-serif" font-size="15" letter-spacing="4">CAMPAIGN FILM  ·  SOCIAL</text>
    </g>
  </svg>`);
}

function adFashionSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${glassDefs()}
    <ellipse cx="720" cy="470" rx="620" ry="400" fill="url(#softGlow)" filter="url(#blur)"/>
    <g transform="translate(118 92) rotate(0.7 670 390)">
      <rect width="1340" height="780" rx="42" fill="url(#glassFill)" stroke="url(#glassEdge)" stroke-width="1.6"/>
      <path d="M72 82 C432 30 906 34 1270 98" fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="1.1"/>
      <path d="M88 704 C430 750 934 742 1254 674" fill="none" stroke="#d6a66a" stroke-opacity="0.12" stroke-width="1.2"/>

      <path d="M124 650 C286 504 362 280 574 142 C692 66 838 80 1018 170 C838 206 722 312 624 474 C522 642 350 724 124 650 Z" fill="url(#champagne)"/>
      <path d="M210 690 C402 574 490 440 602 322 C742 176 922 150 1154 232 C940 248 796 344 682 480 C556 630 414 714 210 690 Z" fill="#f3f4f5" fill-opacity="0.09"/>
      <path d="M244 664 C444 590 568 470 698 338 C826 208 988 170 1154 218" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2.2"/>
      <path d="M300 702 C504 626 636 512 752 398 C884 268 1034 226 1190 258" fill="none" stroke="#d6a66a" stroke-opacity="0.42" stroke-width="2.0"/>

      <text x="814" y="250" fill="#f7f3ec" fill-opacity="0.96" font-family="Georgia, 'Times New Roman', serif" font-size="78" letter-spacing="12">VELORA</text>
      <text x="822" y="308" fill="#d6a66a" fill-opacity="0.92" font-family="Arial, Helvetica, sans-serif" font-size="18" letter-spacing="7">MOVE DIFFERENTLY</text>
      <line x1="822" y1="344" x2="1190" y2="344" stroke="#ffffff" stroke-opacity="0.18"/>
      <text x="822" y="386" fill="#ffffff" fill-opacity="0.62" font-family="Arial, Helvetica, sans-serif" font-size="15" letter-spacing="4">DISPLAY  ·  SOCIAL  ·  FILM</text>
    </g>
  </svg>`);
}

async function renderOverlay(ffmpeg, source, rgba, output, seconds, sourceIn, driftX) {
  await run(ffmpeg, [
    "-y",
    "-ss", String(sourceIn),
    "-stream_loop", "-1", "-i", source,
    "-stream_loop", "-1",
    "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${W}x${H}`, "-framerate", String(FPS), "-i", rgba,
    "-t", String(seconds),
    "-filter_complex",
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},eq=contrast=1.02:brightness=-0.004:saturation=0.92,format=yuv420p[b];[1:v]format=rgba[o];[b][o]overlay=x='${driftX}+1.2*sin(t*0.48)':y='0.8*sin(t*0.34)':shortest=1,format=yuv420p[v]`,
    "-map", "[v]", "-an",
    "-c:v", "libx264", "-preset", "fast", "-crf", "16",
    "-pix_fmt", "yuv420p", "-r", String(FPS),
    output,
  ]);
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
      ads_seconds: String(ADS),
      advertising_proof: "TWO_FINISHED_LUXURY_CAMPAIGN_ADS",
      studio_explanation_deferred: "true",
      real_world_visible_through_glass: "true",
      central_object_present: "false",
      orb_present: "false",
      black_panel: "false",
      dashboard_card_present: "false",
      browser_ui_present: "false",
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

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-scene6-v9-"));
  try {
    const source = path.join(directory, "scene6-v6.mp4");
    const manager = path.join(directory, "manager.mp4");
    const first = path.join(directory, "first.mp4");
    const adA = path.join(directory, "ad-a.mp4");
    const adB = path.join(directory, "ad-b.mp4");
    const picture = path.join(directory, "picture.mp4");
    const final = path.join(directory, "scene6-v9.mp4");

    await Promise.all([download(SOURCE_V6, source), download(MANAGER, manager)]);
    const [adARaw, adBRaw] = await Promise.all([
      svgToRaw(directory, "ad-a-aurelis", adAutomotiveSvg()),
      svgToRaw(directory, "ad-b-velora", adFashionSvg()),
    ]);

    await run(ffmpeg, [
      "-y", "-i", source,
      "-t", String(KEEP),
      "-an",
      "-c:v", "libx264", "-preset", "fast", "-crf", "16",
      "-pix_fmt", "yuv420p", "-r", String(FPS),
      first,
    ]);

    await renderOverlay(ffmpeg, manager, adARaw, adA, AD_A_SECONDS, 3.10, 0);
    await renderOverlay(ffmpeg, manager, adBRaw, adB, AD_B_SECONDS, 4.10, 0);

    const list = path.join(directory, "concat.txt");
    await fs.writeFile(list, [first, adA, adB].map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
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
      ads_seconds: ADS,
      output_ready: true,
      output_path: OUTPUT,
      signed_url: await signedUrl(OUTPUT),
      rules: {
        finished_ads_shown: true,
        studio_explanation_deferred: true,
        optical_glass: true,
        real_world_visible: true,
        orb_present: false,
        black_panel: false,
        fake_ui: false,
        churchill: false,
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
