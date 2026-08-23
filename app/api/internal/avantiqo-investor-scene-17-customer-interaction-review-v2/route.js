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

const TOKEN = "avq-investor-scene-17-customer-interaction-review-v2-20260823";
const CONTRACT = "AVANTIQO_INVESTOR_SCENE_17_CUSTOMER_INTERACTION_REVIEW_V2";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const W = 1920;
const H = 1080;
const FPS = 24;
const DURATION = 5.625;
const VOICE_START = 75.938;
const VOICE_END = 81.563;
const NARRATION = "A customer interaction should not end inside a messaging tool.";

const MANAGER = `${ORG}/unassigned/61b4afe1-93ae-4e1e-a92f-60dff5d629be-avantiqo-investor-manager-ee25292e-4fd3-4249-81cb-3ab526fd2048.mp4`;
const MANAGER_ASSET_ID = "57f2aee6-6950-43e6-b4f6-9940905ded12";
const CUSTOMER_COMMUNICATIONS = `${ORG}/avantiqo-investor-film-20260820/ui/customer_communications.png`;
const CUSTOMER_COMMUNICATIONS_ASSET_ID = "6be3322f-1169-4d9e-86d9-ce8f67d26222";
const VOICE = `${ORG}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3`;
const SCORE = `${ORG}/avantiqo-investor-film-20260820/audio/avantiqo-investor-score-v1-approved.mp3`;
const OUTPUT = `${ORG}/${PROJECT}/scene-previews-20260823/scene-17-customer-interaction-review-v2.mp4`;
const supabase = getServiceSupabase();

const CHANNELS = Object.freeze([
  { id: "whatsapp", label: "WhatsApp", mark: "☎", color: "#25D366", text: "#ffffff", x: 110, y: 190 },
  { id: "line", label: "LINE", mark: "LINE", color: "#06C755", text: "#ffffff", x: 110, y: 300 },
  { id: "messenger", label: "Messenger", mark: "↯", color: "#168AFF", text: "#ffffff", x: 110, y: 410 },
  { id: "facebook", label: "Facebook", mark: "f", color: "#1877F2", text: "#ffffff", x: 110, y: 520 },
  { id: "instagram", label: "Instagram", mark: "◎", color: "#C13584", text: "#ffffff", x: 110, y: 630 },
  { id: "google", label: "Google Reviews", mark: "G", color: "#4285F4", text: "#ffffff", x: 110, y: 740 },
  { id: "email", label: "Email", mark: "@", color: "#EA4335", text: "#ffffff", x: 110, y: 850 },
  { id: "website", label: "Website", mark: "◎", color: "#F2F2EE", text: "#101114", x: 110, y: 960 },
]);

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
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        reject(new Error("SCENE_17_V2_REVIEW_TIMEOUT"));
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
      if (code !== 0) reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-16000) || `MEDIA_EXIT_${code}`));
      else resolve(true);
    });
  });
}

async function download(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`SCENE_17_V2_SOURCE_EMPTY:${storagePath}`);
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

async function makePane(inputPath, outputPath) {
  const paneW = 1120;
  const paneH = 632;
  const inset = 19;
  const innerW = paneW - inset * 2;
  const innerH = paneH - inset * 2;
  const ui = await sharp(inputPath)
    .resize({ width: innerW, height: innerH, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .png()
    .toBuffer();
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${innerW}" height="${innerH}"><rect width="${innerW}" height="${innerH}" rx="23" fill="#fff"/></svg>`);
  const masked = await sharp(ui).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const frame = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${paneW}" height="${paneH}">
    <defs><linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".50"/><stop offset=".52" stop-color="#d6a66a" stop-opacity=".31"/><stop offset="1" stop-color="#ffffff" stop-opacity=".12"/></linearGradient></defs>
    <rect x="6" y="6" width="${paneW - 12}" height="${paneH - 12}" rx="30" fill="#07080a" fill-opacity=".25" stroke="url(#edge)" stroke-width="1.5"/>
    <path d="M28 18 H${paneW - 38}" stroke="#ffffff" stroke-opacity=".20" stroke-width="2" stroke-linecap="round"/>
  </svg>`);
  await sharp({ create: { width: paneW, height: paneH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: masked, left: inset, top: inset }, { input: frame }])
    .png()
    .toFile(outputPath);
}

function channelBadge(channel) {
  const markSize = String(channel.mark).length > 2 ? 14 : 25;
  return `<g transform="translate(${channel.x} ${channel.y})">
    <rect width="260" height="78" rx="20" fill="#07080a" fill-opacity=".62" stroke="#ffffff" stroke-opacity=".10"/>
    <rect x="12" y="12" width="54" height="54" rx="17" fill="${channel.color}"/>
    <text x="39" y="48" text-anchor="middle" fill="${channel.text}" font-family="Arial, Helvetica, sans-serif" font-size="${markSize}" font-weight="800">${channel.mark}</text>
    <text x="82" y="47" fill="#F2F0EA" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="600">${channel.label}</text>
  </g>`;
}

async function makeChannelField(outputPath) {
  const traces = CHANNELS.map((channel) => {
    const sy = channel.y + 39;
    return `<path d="M370 ${sy} C560 ${sy} 600 540 755 540" fill="none" stroke="#d6a66a" stroke-opacity=".34" stroke-width="1.4" stroke-linecap="round"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><filter id="soft"><feGaussianBlur stdDeviation="3"/></filter></defs>
    <g opacity=".78">${traces}</g>
    <circle cx="755" cy="540" r="13" fill="#d6a66a" fill-opacity=".18" filter="url(#soft)"/>
    <circle cx="755" cy="540" r="4" fill="#e8c98d" fill-opacity=".78"/>
    ${CHANNELS.map(channelBadge).join("")}
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
}

async function makeContextLabel(outputPath) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="780" height="86">
    <text x="390" y="40" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="500" letter-spacing="5.5" fill="#F2F0EA" fill-opacity=".90">EVERY INTERACTION → ONE BUSINESS CONTEXT</text>
    <path d="M110 62 H670" stroke="#d6a66a" stroke-opacity=".48" stroke-width="1"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
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
      role: "CUSTOMER_INTERACTION_CHANNELS_TO_AVANTIQO_CONTEXT",
      narration: NARRATION,
      narration_start_seconds: String(VOICE_START),
      narration_end_seconds: String(VOICE_END),
      duration_seconds: String(DURATION),
      manager_asset_id: MANAGER_ASSET_ID,
      manager_analysis_status: "VERIFIED",
      manager_approval_status: "APPROVED",
      customer_communications_asset_id: CUSTOMER_COMMUNICATIONS_ASSET_ID,
      customer_communications_analysis_status: "VERIFIED",
      customer_communications_approval_status: "APPROVED",
      communication_channel_marks: CHANNELS.map((channel) => channel.label).join(","),
      channel_marks_source: "DETERMINISTIC_BRAND_ECOSYSTEM",
      channel_marks_are_editorial_not_product_ui: "true",
      semantic_sequence: "CHANNELS>INTERACTION>AVANTIQO_CUSTOMER_COMMUNICATIONS>BUSINESS_CONTEXT",
      real_world_background: "true",
      authentic_product_ui_only: "true",
      autonomous_marketing_substitution: "false",
      synthetic_product_ui: "false",
      fake_ui_present: "false",
      card_wall_present: "false",
      generic_ai_orb_present: "false",
      recovered_unverified_footage_present: "false",
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

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-scene17-v2-"));
  try {
    const manager = path.join(directory, "manager-approved.mp4");
    const ui = path.join(directory, "customer-communications.png");
    const voice = path.join(directory, "voice.mp3");
    const score = path.join(directory, "score.mp3");
    const pane = path.join(directory, "customer-pane.png");
    const channels = path.join(directory, "channels.png");
    const label = path.join(directory, "context-label.png");
    const final = path.join(directory, "scene17-v2.mp4");

    await Promise.all([
      download(MANAGER, manager),
      download(CUSTOMER_COMMUNICATIONS, ui),
      download(VOICE, voice),
      download(SCORE, score),
    ]);
    await Promise.all([makePane(ui, pane), makeChannelField(channels), makeContextLabel(label)]);

    const filters = [
      `[0:v]scale=1970:1108:force_original_aspect_ratio=increase,crop=${W}:${H}:x='(iw-ow)/2+4*sin(t*0.19)':y='(ih-oh)/2+2*sin(t*0.15)',fps=${FPS},eq=contrast=1.04:brightness=-0.022:saturation=0.84,format=yuv420p[bg]`,
      `[1:v]format=rgba,fade=t=in:st=0.10:d=0.42:alpha=1[channelField]`,
      `[2:v]format=rgba,fade=t=in:st=0.92:d=0.45:alpha=1[customerPane]`,
      `[3:v]format=rgba,fade=t=in:st=3.45:d=0.36:alpha=1[contextLabel]`,
      `[bg][channelField]overlay=0:0:shortest=1[s1]`,
      `[s1][customerPane]overlay=x='760+4*sin(t*0.18)':y='225+3*sin(t*0.15)':shortest=1[s2]`,
      `[s2][contextLabel]overlay=x=965:y=880:shortest=1,format=yuv420p[v]`,
      `[4:a]atrim=start=${VOICE_START}:end=${VOICE_END},asetpts=PTS-STARTPTS,volume=1.03[voice]`,
      `[5:a]atrim=start=${VOICE_START}:end=${VOICE_END},asetpts=PTS-STARTPTS,volume=0.10[score]`,
      `[voice][score]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95,atrim=duration=${DURATION}[a]`,
    ].join(";");

    await run(ffmpeg, [
      "-y",
      "-stream_loop", "-1", "-ss", "2.4", "-i", manager,
      "-loop", "1", "-framerate", String(FPS), "-i", channels,
      "-loop", "1", "-framerate", String(FPS), "-i", pane,
      "-loop", "1", "-framerate", String(FPS), "-i", label,
      "-i", voice,
      "-i", score,
      "-t", String(DURATION),
      "-filter_complex", filters,
      "-map", "[v]",
      "-map", "[a]",
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "16",
      "-pix_fmt", "yuv420p",
      "-r", String(FPS),
      "-c:a", "aac",
      "-b:a", "320k",
      "-ar", "48000",
      "-ac", "2",
      "-movflags", "+faststart",
      final,
    ]);

    const stored = await upload(final);
    return {
      success: true,
      contract: CONTRACT,
      scene: 17,
      role: "CUSTOMER_INTERACTION_CHANNELS_TO_AVANTIQO_CONTEXT",
      duration_seconds: DURATION,
      narration: NARRATION,
      output_ready: true,
      output_path: OUTPUT,
      signed_url: await signedUrl(OUTPUT),
      manager: {
        asset_id: MANAGER_ASSET_ID,
        storage_path: MANAGER,
        analysis_status: "VERIFIED",
        approval_status: "APPROVED",
      },
      authentic_ui: {
        asset_id: CUSTOMER_COMMUNICATIONS_ASSET_ID,
        storage_path: CUSTOMER_COMMUNICATIONS,
        role: "CUSTOMER_COMMUNICATIONS",
        analysis_status: "VERIFIED",
        approval_status: "APPROVED",
      },
      channels: CHANNELS.map((channel) => channel.label),
      semantic_sequence: ["CHANNELS", "CUSTOMER_INTERACTION", "AVANTIQO_CUSTOMER_COMMUNICATIONS", "BUSINESS_CONTEXT"],
      rules: {
        real_world_background: true,
        authentic_product_ui_only: true,
        autonomous_marketing_substitution: false,
        channel_marks_are_editorial_not_product_ui: true,
        synthetic_product_ui: false,
        fake_ui_present: false,
        card_wall_present: false,
        generic_ai_orb_present: false,
        recovered_unverified_footage_present: false,
        image_generation_used: false,
        churchill_present: false,
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
    if (action === "status") return json({
      success: true,
      contract: CONTRACT,
      scene: 17,
      output_ready: ready,
      output_path: OUTPUT,
      source_quality: "VERIFIED_APPROVED_ONLY",
      semantic_sequence: ["CHANNELS", "CUSTOMER_INTERACTION", "AVANTIQO_CUSTOMER_COMMUNICATIONS", "BUSINESS_CONTEXT"],
    });
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, contract: CONTRACT, error: error?.message || String(error) }, 500);
  }
}
