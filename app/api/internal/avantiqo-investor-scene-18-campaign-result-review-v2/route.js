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

const TOKEN = "avq-investor-scene-18-campaign-result-review-v2-20260823";
const CONTRACT = "AVANTIQO_INVESTOR_SCENE_18_CAMPAIGN_RESULT_REVIEW_V2";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const W = 1920;
const H = 1080;
const FPS = 24;
const DURATION = 5.625;
const VOICE_START = 81.563;
const VOICE_END = 87.188;
const NARRATION = "A campaign should not be disconnected from the customer or the result it creates.";

const MANAGER = `${ORG}/unassigned/61b4afe1-93ae-4e1e-a92f-60dff5d629be-avantiqo-investor-manager-ee25292e-4fd3-4249-81cb-3ab526fd2048.mp4`;
const MANAGER_ASSET_ID = "57f2aee6-6950-43e6-b4f6-9940905ded12";
const VOICE = `${ORG}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3`;
const SCORE = `${ORG}/avantiqo-investor-film-20260820/audio/avantiqo-investor-score-v1-approved.mp3`;

const UI = Object.freeze({
  campaign: {
    path: `${ORG}/avantiqo-investor-film-20260820/ui/autonomous_marketing.png`,
    asset_id: "c4cd1d0f-5eb1-48f6-a35d-61b7e8466a84",
    role: "AUTONOMOUS_MARKETING",
  },
  customer: {
    path: `${ORG}/avantiqo-investor-film-20260820/ui/customer_communications.png`,
    asset_id: "6be3322f-1169-4d9e-86d9-ce8f67d26222",
    role: "CUSTOMER_COMMUNICATIONS",
  },
  result: {
    path: `${ORG}/avantiqo-investor-film-20260820/ui/finance.png`,
    asset_id: "ec166c5d-55ac-44f4-a7eb-5b6c03dab36f",
    role: "FINANCE_RESULT_CONTEXT",
  },
});

const CAMPAIGN_CHANNELS = Object.freeze([
  { label: "Facebook", mark: "f", color: "#1877F2", text: "#ffffff" },
  { label: "Instagram", mark: "◎", color: "#C13584", text: "#ffffff" },
  { label: "Google Ads", mark: "G", color: "#4285F4", text: "#ffffff" },
  { label: "TikTok", mark: "♪", color: "#111111", text: "#ffffff" },
  { label: "YouTube", mark: "▶", color: "#FF0000", text: "#ffffff" },
  { label: "LinkedIn", mark: "in", color: "#0A66C2", text: "#ffffff" },
]);

const OUTPUT = `${ORG}/${PROJECT}/scene-previews-20260823/scene-18-campaign-customer-result-review-v2.mp4`;
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
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        reject(new Error("SCENE_18_V2_REVIEW_TIMEOUT"));
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
  if (!data) throw new Error(`SCENE_18_V2_SOURCE_EMPTY:${storagePath}`);
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

async function makePane(inputPath, outputPath, width, height, radius = 18) {
  const inset = 15;
  const innerW = width - inset * 2;
  const innerH = height - inset * 2;
  const ui = await sharp(inputPath)
    .resize({ width: innerW, height: innerH, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .png()
    .toBuffer();
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${innerW}" height="${innerH}"><rect width="${innerW}" height="${innerH}" rx="${radius}" fill="#fff"/></svg>`);
  const masked = await sharp(ui).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const frame = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".48"/><stop offset=".52" stop-color="#d6a66a" stop-opacity=".31"/><stop offset="1" stop-color="#ffffff" stop-opacity=".11"/></linearGradient></defs>
    <rect x="5" y="5" width="${width - 10}" height="${height - 10}" rx="${radius + 6}" fill="#07080a" fill-opacity=".24" stroke="url(#edge)" stroke-width="1.35"/>
    <path d="M22 16 H${width - 27}" stroke="#ffffff" stroke-opacity=".17" stroke-width="2" stroke-linecap="round"/>
  </svg>`);
  await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: masked, left: inset, top: inset }, { input: frame }])
    .png()
    .toFile(outputPath);
}

function channelBadge(channel, x, y) {
  const markSize = String(channel.mark).length > 1 ? 15 : 25;
  return `<g transform="translate(${x} ${y})">
    <rect width="220" height="64" rx="17" fill="#07080a" fill-opacity=".68" stroke="#ffffff" stroke-opacity=".10"/>
    <rect x="10" y="10" width="44" height="44" rx="14" fill="${channel.color}"/>
    <text x="32" y="39" text-anchor="middle" fill="${channel.text}" font-family="Arial, Helvetica, sans-serif" font-size="${markSize}" font-weight="800">${channel.mark}</text>
    <text x="69" y="39" fill="#F2F0EA" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="600">${channel.label}</text>
  </g>`;
}

async function makeCampaignField(outputPath) {
  const positions = [
    [95, 250], [95, 330], [95, 410],
    [95, 490], [95, 570], [95, 650],
  ];
  const paths = positions.map(([, y]) => `<path d="M315 ${y + 32} C500 ${y + 32} 595 515 760 515" fill="none" stroke="#d6a66a" stroke-opacity=".34" stroke-width="1.4" stroke-linecap="round"/>`).join("");
  const badges = CAMPAIGN_CHANNELS.map((channel, index) => channelBadge(channel, positions[index][0], positions[index][1])).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${paths}
    <circle cx="760" cy="515" r="4" fill="#e5c489" fill-opacity=".80"/>
    ${badges}
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
}

async function makeBridge(outputPath) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="trace" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity=".18"/><stop offset=".5" stop-color="#d6a66a" stop-opacity=".72"/><stop offset="1" stop-color="#ffffff" stop-opacity=".24"/></linearGradient></defs>
    <path d="M770 540 C920 540 1000 540 1150 540" fill="none" stroke="url(#trace)" stroke-width="2" stroke-linecap="round"/>
    <path d="M1146 534 L1158 540 L1146 546" fill="none" stroke="#d6a66a" stroke-opacity=".72" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
}

async function makeStageLabel(outputPath, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="76">
    <text x="260" y="39" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="500" letter-spacing="6" fill="#F3EFE8" fill-opacity=".90">${label}</text>
    <path d="M145 58 H375" stroke="#d6a66a" stroke-opacity=".48" stroke-width="1"/>
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
      scene: "18",
      role: "CAMPAIGN_TO_CUSTOMER_TO_MEASURABLE_RESULT",
      narration: NARRATION,
      narration_start_seconds: String(VOICE_START),
      narration_end_seconds: String(VOICE_END),
      duration_seconds: String(DURATION),
      manager_asset_id: MANAGER_ASSET_ID,
      manager_analysis_status: "VERIFIED",
      manager_approval_status: "APPROVED",
      ui_asset_ids: Object.values(UI).map((entry) => entry.asset_id).join(","),
      ui_analysis_status: "VERIFIED",
      ui_approval_status: "APPROVED",
      campaign_channel_marks: CAMPAIGN_CHANNELS.map((entry) => entry.label).join(","),
      campaign_channel_marks_are_editorial_not_product_ui: "true",
      semantic_sequence: "CAMPAIGN_CHANNELS>AUTONOMOUS_MARKETING>CUSTOMER_CONTEXT>MEASURABLE_FINANCE_RESULT",
      result_context: "AUTHENTIC_FINANCE_SURFACE_AS_MEASURABLE_BUSINESS_OUTCOME",
      kitchen_or_restaurant_substitution: "false",
      real_world_background: "true",
      authentic_product_ui_only: "true",
      simultaneous_product_panes_max: "2",
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

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-scene18-v2-"));
  try {
    const manager = path.join(directory, "manager-approved.mp4");
    const voice = path.join(directory, "voice.mp3");
    const score = path.join(directory, "score.mp3");
    const uiFiles = {};
    const panes = {};

    await Promise.all([
      download(MANAGER, manager),
      download(VOICE, voice),
      download(SCORE, score),
      ...Object.entries(UI).map(async ([key, entry]) => {
        const local = path.join(directory, `${key}.png`);
        uiFiles[key] = local;
        await download(entry.path, local);
      }),
    ]);

    panes.campaign = path.join(directory, "campaign-pane.png");
    panes.customer = path.join(directory, "customer-pane.png");
    panes.result = path.join(directory, "result-pane.png");
    await Promise.all([
      makePane(uiFiles.campaign, panes.campaign, 930, 524, 22),
      makePane(uiFiles.customer, panes.customer, 820, 462, 21),
      makePane(uiFiles.result, panes.result, 820, 462, 21),
    ]);

    const campaignField = path.join(directory, "campaign-field.png");
    const bridge = path.join(directory, "bridge.png");
    const campaignLabel = path.join(directory, "campaign-label.png");
    const customerLabel = path.join(directory, "customer-label.png");
    const resultLabel = path.join(directory, "result-label.png");
    await Promise.all([
      makeCampaignField(campaignField),
      makeBridge(bridge),
      makeStageLabel(campaignLabel, "CAMPAIGN"),
      makeStageLabel(customerLabel, "CUSTOMER"),
      makeStageLabel(resultLabel, "MEASURABLE RESULT"),
    ]);

    const final = path.join(directory, "scene18-v2.mp4");
    const filters = [
      `[0:v]scale=1970:1108:force_original_aspect_ratio=increase,crop=${W}:${H}:x='(iw-ow)/2+4*sin(t*0.19)':y='(ih-oh)/2+2*sin(t*0.15)',fps=${FPS},eq=contrast=1.04:brightness=-0.022:saturation=0.84,format=yuv420p[bg]`,
      `[1:v]format=rgba,fade=t=in:st=0.08:d=0.28:alpha=1,fade=t=out:st=1.72:d=0.38:alpha=1[campaignField]`,
      `[2:v]format=rgba,fade=t=in:st=0.28:d=0.34:alpha=1,fade=t=out:st=2.05:d=0.42:alpha=1[campaignPane]`,
      `[3:v]format=rgba,fade=t=in:st=1.72:d=0.38:alpha=1,fade=t=out:st=3.78:d=0.42:alpha=1[customerPane]`,
      `[4:v]format=rgba,fade=t=in:st=3.42:d=0.40:alpha=1[resultPane]`,
      `[5:v]format=rgba,fade=t=in:st=3.42:d=0.36:alpha=1[bridge]`,
      `[6:v]format=rgba,fade=t=in:st=0.10:d=0.25:alpha=1,fade=t=out:st=1.70:d=0.30:alpha=1[campaignLabel]`,
      `[7:v]format=rgba,fade=t=in:st=1.80:d=0.25:alpha=1,fade=t=out:st=3.65:d=0.30:alpha=1[customerLabel]`,
      `[8:v]format=rgba,fade=t=in:st=3.72:d=0.28:alpha=1[resultLabel]`,
      `[bg][campaignField]overlay=0:0:shortest=1[s1]`,
      `[s1][campaignPane]overlay=x='790+4*sin(t*0.18)':y='270+3*sin(t*0.15)':shortest=1[s2]`,
      `[s2][customerPane]overlay=x='550+4*sin(t*0.17)':y='300+3*sin(t*0.14)':shortest=1[s3]`,
      `[s3][resultPane]overlay=x='1100+4*sin(t*0.16)':y='300+3*sin(t*0.13)':shortest=1[s4]`,
      `[s4][bridge]overlay=0:0:shortest=1[s5]`,
      `[s5][campaignLabel]overlay=x=1150:y=865:shortest=1[s6]`,
      `[s6][customerLabel]overlay=x=690:y=865:shortest=1[s7]`,
      `[s7][resultLabel]overlay=x=1245:y=865:shortest=1,format=yuv420p[v]`,
      `[9:a]atrim=start=${VOICE_START}:end=${VOICE_END},asetpts=PTS-STARTPTS,volume=1.03[voice]`,
      `[10:a]atrim=start=${VOICE_START}:end=${VOICE_END},asetpts=PTS-STARTPTS,volume=0.10[score]`,
      `[voice][score]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95,atrim=duration=${DURATION}[a]`,
    ].join(";");

    await run(ffmpeg, [
      "-y",
      "-stream_loop", "-1", "-ss", "2.8", "-i", manager,
      "-loop", "1", "-framerate", String(FPS), "-i", campaignField,
      "-loop", "1", "-framerate", String(FPS), "-i", panes.campaign,
      "-loop", "1", "-framerate", String(FPS), "-i", panes.customer,
      "-loop", "1", "-framerate", String(FPS), "-i", panes.result,
      "-loop", "1", "-framerate", String(FPS), "-i", bridge,
      "-loop", "1", "-framerate", String(FPS), "-i", campaignLabel,
      "-loop", "1", "-framerate", String(FPS), "-i", customerLabel,
      "-loop", "1", "-framerate", String(FPS), "-i", resultLabel,
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
      scene: 18,
      role: "CAMPAIGN_TO_CUSTOMER_TO_MEASURABLE_RESULT",
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
      authentic_ui: Object.fromEntries(Object.entries(UI).map(([key, entry]) => [key, {
        asset_id: entry.asset_id,
        storage_path: entry.path,
        role: entry.role,
        analysis_status: "VERIFIED",
        approval_status: "APPROVED",
      }])),
      campaign_channels: CAMPAIGN_CHANNELS.map((entry) => entry.label),
      semantic_sequence: ["CAMPAIGN_CHANNELS", "AUTONOMOUS_MARKETING", "CUSTOMER_CONTEXT", "MEASURABLE_FINANCE_RESULT"],
      rules: {
        real_world_background: true,
        authentic_product_ui_only: true,
        kitchen_or_restaurant_substitution: false,
        simultaneous_product_panes_max: 2,
        campaign_channel_marks_are_editorial_not_product_ui: true,
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
      scene: 18,
      output_ready: ready,
      output_path: OUTPUT,
      source_quality: "VERIFIED_APPROVED_ONLY",
      semantic_sequence: ["CAMPAIGN_CHANNELS", "AUTONOMOUS_MARKETING", "CUSTOMER_CONTEXT", "MEASURABLE_FINANCE_RESULT"],
    });
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, contract: CONTRACT, error: error?.message || String(error) }, 500);
  }
}
