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

const TOKEN = "avq-investor-scene-17-autonomous-marketing-review-v1-20260823";
const CONTRACT = "AVANTIQO_INVESTOR_SCENE_17_AUTONOMOUS_MARKETING_REVIEW_V1";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const W = 1920;
const H = 1080;
const FPS = 24;
const DURATION = 5.625;
const VOICE_START = 75.938;
const VOICE_END = 81.563;
const LOCKED_LINE = "A customer interaction should not end inside a messaging tool. A campaign should not be disconnected from the customer or the result it creates. A quotation, booking, task, service and follow-up should stay connected to the same business reality.";

const BACKGROUND = `${ORG}/unassigned/a360b2ec-ba79-4213-8732-1f3bd5b9785c-avantiqo-investor-manager-013346ff-b7a0-415d-b09d-1dba40b4be0b.mp4`;
const BACKGROUND_ASSET_ID = "e719558e-d0dd-46a7-b79a-061fa8a9752f";
const AUTHENTIC_UI = `${ORG}/avantiqo-investor-film-20260820/ui/autonomous_marketing.png`;
const AUTHENTIC_UI_ASSET_ID = "c4cd1d0f-5eb1-48f6-a35d-61b7e8466a84";
const VOICE = `${ORG}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3`;
const SCORE = `${ORG}/avantiqo-investor-film-20260820/audio/avantiqo-investor-score-v1-approved.mp3`;
const OUTPUT = `${ORG}/${PROJECT}/scene-previews-20260823/scene-17-autonomous-marketing-review-v1.mp4`;

const supabase = getServiceSupabase();

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

function run(command, args, timeoutMs = 285000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, OMP_NUM_THREADS: "1" } });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        reject(new Error("SCENE_17_REVIEW_TIMEOUT"));
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
      const err = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) reject(new Error(err.slice(-16000) || `MEDIA_EXIT_${code}`));
      else resolve(Buffer.concat(stdout).toString("utf8"));
    });
  });
}

async function download(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`SCENE_17_SOURCE_EMPTY:${storagePath}`);
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

async function makePane(uiPath, outputPath) {
  const paneW = 1280;
  const paneH = 722;
  const inset = 22;
  const innerW = paneW - inset * 2;
  const innerH = paneH - inset * 2;
  const ui = await sharp(uiPath)
    .resize({ width: innerW, height: innerH, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .png()
    .toBuffer();
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${innerW}" height="${innerH}"><rect width="${innerW}" height="${innerH}" rx="24" fill="#fff"/></svg>`);
  const masked = await sharp(ui).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const glass = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${paneW}" height="${paneH}"><defs><linearGradient id="e" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7f5ef" stop-opacity=".56"/><stop offset=".5" stop-color="#d6a66a" stop-opacity=".30"/><stop offset="1" stop-color="#ffffff" stop-opacity=".14"/></linearGradient></defs><rect x="7" y="7" width="${paneW - 14}" height="${paneH - 14}" rx="30" fill="#ffffff" fill-opacity=".014" stroke="url(#e)" stroke-width="1.6"/><path d="M28 17 H${paneW - 38}" stroke="#ffffff" stroke-opacity=".22" stroke-width="2" stroke-linecap="round"/></svg>`);
  await sharp({ create: { width: paneW, height: paneH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: masked, left: inset, top: inset }, { input: glass }])
    .png()
    .toFile(outputPath);
}

async function makeOutboundTrace(outputPath) {
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="s" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5"/></filter><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f8f4e9" stop-opacity=".62"/><stop offset=".46" stop-color="#d6a66a" stop-opacity=".36"/><stop offset="1" stop-color="#d6a66a" stop-opacity="0"/></linearGradient></defs><path d="M1240 510 C1480 495 1650 520 2000 575" fill="none" stroke="url(#g)" stroke-width="1.5" stroke-linecap="round" filter="url(#s)"/><path d="M1240 510 C1480 495 1650 520 2000 575" fill="none" stroke="#e6c98b" stroke-opacity=".42" stroke-width="1" stroke-linecap="round"/></svg>`);
  await sharp(svg).png().toFile(outputPath);
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
      scene: "17",
      role: "AUTONOMOUS_MARKETING_TO_BUSINESS_CONTEXT",
      locked_narration_line: LOCKED_LINE,
      narration_segment_start_seconds: String(VOICE_START),
      narration_segment_end_seconds: String(VOICE_END),
      duration_seconds: String(DURATION),
      background_asset_id: BACKGROUND_ASSET_ID,
      background_approval: "APPROVED",
      authentic_ui_asset_id: AUTHENTIC_UI_ASSET_ID,
      authentic_ui_storage_path: AUTHENTIC_UI,
      authentic_ui_role: "autonomous_marketing",
      authentic_ui_approval: "APPROVED",
      authentic_ui_usage_policy: "BRIEF_IN_WORLD_OR_SPATIAL_GLASS_INSERT_ONLY",
      campaign_context_trace: "true",
      dominant_full_screen_ui: "false",
      synthetic_product_ui: "false",
      fake_ui_present: "false",
      card_wall_present: "false",
      orb_present: "false",
      image_generation_used: "false",
      churchill_present: "false",
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
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-scene17-"));
  try {
    const background = path.join(directory, "manager.mp4");
    const ui = path.join(directory, "autonomous-marketing.png");
    const voice = path.join(directory, "voice.mp3");
    const score = path.join(directory, "score.mp3");
    const pane = path.join(directory, "pane.png");
    const trace = path.join(directory, "trace.png");
    const picture = path.join(directory, "picture.mp4");
    const final = path.join(directory, "scene17-final.mp4");
    await Promise.all([download(BACKGROUND, background), download(AUTHENTIC_UI, ui), download(VOICE, voice), download(SCORE, score)]);
    await Promise.all([makePane(ui, pane), makeOutboundTrace(trace)]);
    await run(ffmpeg, [
      "-y", "-stream_loop", "-1", "-ss", "1.1", "-i", background,
      "-loop", "1", "-framerate", String(FPS), "-i", pane,
      "-loop", "1", "-framerate", String(FPS), "-i", trace,
      "-t", String(DURATION),
      "-filter_complex",
      `[0:v]scale=1960:1103:force_original_aspect_ratio=increase,crop=${W}:${H}:x='(iw-ow)/2+3*sin(t*0.20)':y='(ih-oh)/2+2*sin(t*0.15)',fps=${FPS},eq=contrast=1.035:brightness=-0.010:saturation=0.91,format=yuv420p[bg];[1:v]format=rgba,fade=t=in:st=0.08:d=0.42:alpha=1,scale=w='if(lt(t,1.10),720+500*(t/1.10),1220)':h=-2:eval=frame[pane];[bg][pane]overlay=x='if(lt(t,1.10),1020-565*(t/1.10),455+4*sin(t*0.28))':y='if(lt(t,1.10),450-255*(t/1.10),195+3*sin(t*0.22))'[withpane];[2:v]format=rgba,fade=t=in:st=1.05:d=0.45:alpha=1[trace];[withpane][trace]overlay=0:0:shortest=1,format=yuv420p[v]`,
      "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", picture,
    ]);
    await run(ffmpeg, [
      "-y", "-i", picture, "-i", voice, "-i", score,
      "-filter_complex",
      `[1:a]atrim=start=${VOICE_START}:end=${VOICE_END},asetpts=PTS-STARTPTS,volume=1.02[voice];[2:a]atrim=start=${VOICE_START}:end=${VOICE_END},asetpts=PTS-STARTPTS,volume=0.10[score];[voice][score]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95,atrim=duration=${DURATION}[a]`,
      "-map", "0:v:0", "-map", "[a]", "-t", String(DURATION), "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", final,
    ]);
    const stored = await upload(final);
    return { success: true, contract: CONTRACT, scene: 17, role: "AUTONOMOUS_MARKETING_TO_BUSINESS_CONTEXT", duration_seconds: DURATION, narration_segment: { start: VOICE_START, end: VOICE_END, locked_line: LOCKED_LINE }, output_ready: true, output_path: OUTPUT, signed_url: await signedUrl(OUTPUT), rules: { approved_manager_background: true, authentic_autonomous_marketing_ui: true, campaign_context_trace: true, dominant_full_screen_ui: false, synthetic_product_ui: false, fake_ui_present: false, card_wall_present: false, orb_present: false, image_generation_used: false, churchill_present: false }, ...stored };
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
    if (action === "status") return json({ success: true, contract: CONTRACT, scene: 17, output_ready: ready, output_path: OUTPUT });
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, contract: CONTRACT, error: error?.message || String(error) }, 500);
  }
}
