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
import { investorBrandDefs, investorBrandMark } from "@/lib/investor-film/InvestorBrandMarkRuntime";

const TOKEN = "avq-investor-scene-6-fragmentation-review-v6-20260822";
const CONTRACT = "AVANTIQO_INVESTOR_SCENE_6_FRAGMENTATION_REVIEW_V6";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const W = 1920;
const H = 1080;
const FPS = 24;
const DURATION = 7.6;
const FIRST_THREE_END = 3.306;
const CONVERSATIONS = 1.368;
const CAMPAIGNS = 1.406;
const CREATIVE = 1.52;

const SOURCE_V5 = `${ORG}/${PROJECT}/scene-previews-20260822/scene-06-fragmentation-review-v5.mp4`;
const MANAGER = `${ORG}/unassigned/b1f518b9-e1da-4153-a665-93d1768b42f3-gemini-5sts8qv981mh.mp4`;
const OUTPUT = `${ORG}/${PROJECT}/scene-previews-20260822/scene-06-fragmentation-review-v6.mp4`;

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
        reject(new Error("SCENE_6_V6_TIMEOUT"));
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
  if (!data) throw new Error(`SCENE_6_V6_SOURCE_EMPTY:${storagePath}`);
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

function logo(key, x, y, size, background) {
  const radius = Math.round(size * 0.24);
  const markSize = Math.round(size * 0.58);
  const offset = (size - markSize) / 2;
  return `<g transform="translate(${x} ${y})"><rect width="${size}" height="${size}" rx="${radius}" fill="${background}" fill-opacity="0.97" stroke="#ffffff" stroke-opacity="0.19" stroke-width="1.2"/><path d="M14 8 H${size - 14}" stroke="#ffffff" stroke-opacity="0.17" stroke-width="1"/>${investorBrandMark(key, { x: offset, y: offset, size: markSize })}</g>`;
}

function channelsSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${investorBrandDefs()}<radialGradient id="halo" cx="31%" cy="36%" r="60%"><stop offset="0" stop-color="#ffffff" stop-opacity="0.09"/><stop offset="0.55" stop-color="#d6a66a" stop-opacity="0.025"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient><linearGradient id="ray" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.52" stop-color="#e8edf2" stop-opacity="0.18"/><stop offset="1" stop-color="#d6a66a" stop-opacity="0"/></linearGradient></defs><ellipse cx="630" cy="430" rx="620" ry="430" fill="url(#halo)"/><path d="M175 154 L548 760" stroke="url(#ray)" stroke-width="1.2"/><path d="M468 122 L616 756" stroke="#ffffff" stroke-opacity="0.085" stroke-width="1"/><path d="M790 150 L680 756" stroke="#d6a66a" stroke-opacity="0.085" stroke-width="1"/>${logo("whatsapp",158,244,112,"#25D366")}${logo("line",332,132,104,"#06C755")}${logo("messenger",492,292,116,"url(#avqMessengerGradient)")}${logo("instagram",672,148,116,"url(#avqInstagramGradient)")}${logo("facebook",848,292,108,"#1877F2")}${logo("googleReviews",1002,166,116,"#FFFFFF")}</svg>`);
}

function campaignsSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${investorBrandDefs()}<linearGradient id="arc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.46" stop-color="#ffffff" stop-opacity="0.16"/><stop offset="0.58" stop-color="#d6a66a" stop-opacity="0.13"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs><path d="M134 736 C430 530 820 486 1178 602" fill="none" stroke="url(#arc)" stroke-width="1.5"/>${logo("facebook",152,280,108,"#1877F2")}${logo("instagram",336,158,116,"url(#avqInstagramGradient)")}${logo("googleAds",520,306,120,"#FFFFFF")}${logo("tiktok",714,170,112,"#050505")}${logo("youtube",894,304,116,"#FF0000")}${logo("linkedin",1078,186,108,"#0A66C2")}</svg>`);
}

function creativeSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.38"/><stop offset="0.52" stop-color="#d8dde2" stop-opacity="0.09"/><stop offset="1" stop-color="#d6a66a" stop-opacity="0.31"/></linearGradient><linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.11"/><stop offset="0.42" stop-color="#8c939b" stop-opacity="0.03"/><stop offset="1" stop-color="#060708" stop-opacity="0.09"/></linearGradient><radialGradient id="hero" cx="35%" cy="28%" r="76%"><stop offset="0" stop-color="#f4ede0"/><stop offset="0.18" stop-color="#baa37b"/><stop offset="0.40" stop-color="#40352f"/><stop offset="0.68" stop-color="#0f1113"/><stop offset="1" stop-color="#020304"/></radialGradient><linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f2ec"/><stop offset="0.25" stop-color="#92989f"/><stop offset="0.48" stop-color="#20242a"/><stop offset="0.70" stop-color="#d6a66a"/><stop offset="1" stop-color="#050607"/></linearGradient><filter id="soft"><feGaussianBlur stdDeviation="32"/></filter></defs><g transform="translate(110 88) rotate(-1.1 690 420)"><rect width="1380" height="840" rx="28" fill="#05070a" fill-opacity="0.20" stroke="url(#edge)" stroke-width="1.5"/><rect x="18" y="18" width="1344" height="804" rx="22" fill="url(#glass)"/><rect x="52" y="52" width="1276" height="736" rx="14" fill="url(#hero)"/><ellipse cx="420" cy="350" rx="280" ry="250" fill="#d6a66a" fill-opacity="0.08" filter="url(#soft)"/><g transform="translate(388 420)"><rect x="-92" y="-210" width="184" height="420" rx="48" fill="url(#metal)"/><rect x="-63" y="-174" width="126" height="334" rx="36" fill="#090b0e" fill-opacity="0.34"/><path d="M-56 -148 C-18 -192 33 -192 69 -150" fill="none" stroke="#ffffff" stroke-opacity="0.40" stroke-width="5"/></g><text x="760" y="334" fill="#f7f3ec" font-family="Georgia, serif" font-size="86" letter-spacing="9">NOCTURNE</text><text x="768" y="406" fill="#d6a66a" font-family="Arial, Helvetica, sans-serif" font-size="21" letter-spacing="8">A NEW STANDARD</text><line x1="768" y1="452" x2="1190" y2="452" stroke="#ffffff" stroke-opacity="0.20"/><text x="768" y="518" fill="#ffffff" fill-opacity="0.80" font-family="Arial, Helvetica, sans-serif" font-size="20" letter-spacing="3">FILM  •  SOCIAL  •  CAMPAIGN</text></g></svg>`);
}

async function renderOverlay(ffmpeg, source, rgba, output, seconds, sourceIn) {
  await run(ffmpeg, [
    "-y",
    "-ss", String(sourceIn),
    "-stream_loop", "-1", "-i", source,
    "-stream_loop", "-1", "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${W}x${H}`, "-framerate", String(FPS), "-i", rgba,
    "-t", String(seconds),
    "-filter_complex",
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},eq=contrast=1.03:brightness=-0.01:saturation=0.91,format=yuv420p[b];[1:v]format=rgba[o];[b][o]overlay=x='2.0*sin(t*0.48)':y='1.6*sin(t*0.39)':shortest=1,format=yuv420p[v]`,
    "-map", "[v]", "-an",
    "-c:v", "libx264", "-preset", "fast", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart",
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
      logo_scale_policy: "LARGE_OVER_COMPUTER_SCREEN_AREA",
      creative_output_explicit: "true",
      full_studio_intelligence_demo_deferred: "true",
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
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-scene6-v6-"));
  try {
    const source = path.join(directory, "scene6-v5.mp4");
    const manager = path.join(directory, "manager.mp4");
    const firstThree = path.join(directory, "first-three.mp4");
    const conversations = path.join(directory, "conversations.mp4");
    const campaigns = path.join(directory, "campaigns.mp4");
    const creative = path.join(directory, "creative.mp4");
    const picture = path.join(directory, "picture.mp4");
    const final = path.join(directory, "scene6-v6.mp4");

    await Promise.all([download(SOURCE_V5, source), download(MANAGER, manager)]);
    const [channelsRaw, campaignsRaw, creativeRaw] = await Promise.all([
      svgToRaw(directory, "channels", channelsSvg()),
      svgToRaw(directory, "campaigns", campaignsSvg()),
      svgToRaw(directory, "creative", creativeSvg()),
    ]);

    await run(ffmpeg, ["-y", "-i", source, "-t", String(FIRST_THREE_END), "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(FPS), firstThree]);
    await renderOverlay(ffmpeg, manager, channelsRaw, conversations, CONVERSATIONS, 0.22);
    await renderOverlay(ffmpeg, manager, campaignsRaw, campaigns, CAMPAIGNS, 1.65);
    await renderOverlay(ffmpeg, manager, creativeRaw, creative, CREATIVE, 3.10);

    const list = path.join(directory, "concat.txt");
    await fs.writeFile(list, [firstThree, conversations, campaigns, creative].map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
    await run(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-an", "-c:v", "copy", picture]);

    await run(ffmpeg, [
      "-y", "-i", picture, "-i", source,
      "-map", "0:v:0", "-map", "1:a:0", "-t", String(DURATION),
      "-c:v", "copy", "-c:a", "copy", "-movflags", "+faststart", final,
    ]);

    const stored = await upload(final);
    return {
      success: true,
      contract: CONTRACT,
      scene: 6,
      duration_seconds: DURATION,
      output_ready: true,
      output_path: OUTPUT,
      signed_url: await signedUrl(OUTPUT),
      rules: {
        larger_over_screen_marks: true,
        creative_output_explicit: true,
        full_studio_demo_later: true,
        no_orb: true,
        no_pills: true,
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
