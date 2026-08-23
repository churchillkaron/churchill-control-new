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

const TOKEN = "avq-investor-scene-13-connected-execution-review-v2-20260823";
const CONTRACT = "AVANTIQO_INVESTOR_SCENE_13_CONNECTED_EXECUTION_REVIEW_V2";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const W = 1920;
const H = 1080;
const FPS = 24;
const DURATION = 7.172;
const VOICE_START = 54.844;
const VOICE_END = 62.016;
const NARRATION = "Avantiqo connects the business so information, decisions and execution can work together.";

const MANAGER = `${ORG}/unassigned/61b4afe1-93ae-4e1e-a92f-60dff5d629be-avantiqo-investor-manager-ee25292e-4fd3-4249-81cb-3ab526fd2048.mp4`;
const MANAGER_ASSET_ID = "57f2aee6-6950-43e6-b4f6-9940905ded12";
const VOICE = `${ORG}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3`;
const SCORE = `${ORG}/avantiqo-investor-film-20260820/audio/avantiqo-investor-score-v1-approved.mp3`;

const UI = Object.freeze({
  finance: {
    path: `${ORG}/avantiqo-investor-film-20260820/ui/finance.png`,
    asset_id: "ec166c5d-55ac-44f4-a7eb-5b6c03dab36f",
    role: "FINANCE",
  },
  customer: {
    path: `${ORG}/avantiqo-investor-film-20260820/ui/customer_communications.png`,
    asset_id: "6be3322f-1169-4d9e-86d9-ce8f67d26222",
    role: "CUSTOMER_COMMUNICATIONS",
  },
  operations: {
    path: `${ORG}/avantiqo-investor-film-20260820/ui/operations_command_center.png`,
    asset_id: "7b6e46c4-694e-40ba-bef6-489f9d5e52ac",
    role: "OPERATIONS_COMMAND_CENTER",
  },
  intelligence: {
    path: `${ORG}/avantiqo-investor-film-20260820/ui/organization_intelligence.png`,
    asset_id: "6d719949-d319-4bbb-b2fd-f736c3e4ca95",
    role: "ORGANIZATION_INTELLIGENCE",
  },
});

const OUTPUT = `${ORG}/${PROJECT}/scene-previews-20260823/scene-13-information-decision-execution-review-v2.mp4`;
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
        reject(new Error("SCENE_13_V2_REVIEW_TIMEOUT"));
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
  if (!data) throw new Error(`SCENE_13_V2_SOURCE_EMPTY:${storagePath}`);
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
    <defs><linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".46"/><stop offset=".5" stop-color="#d6a66a" stop-opacity=".30"/><stop offset="1" stop-color="#ffffff" stop-opacity=".11"/></linearGradient></defs>
    <rect x="5" y="5" width="${width - 10}" height="${height - 10}" rx="${radius + 6}" fill="#07080a" fill-opacity=".24" stroke="url(#edge)" stroke-width="1.35"/>
    <path d="M22 16 H${width - 27}" stroke="#ffffff" stroke-opacity=".17" stroke-width="2" stroke-linecap="round"/>
  </svg>`);
  await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: masked, left: inset, top: inset }, { input: frame }])
    .png()
    .toFile(outputPath);
}

async function makeFlowLayer(outputPath, direction) {
  const inbound = direction === "in";
  const marker = inbound ? "inArrow" : "outArrow";
  const paths = inbound
    ? [
        "M545 275 C650 310 700 360 760 430",
        "M545 790 C650 735 700 680 760 620",
        "M1375 535 C1260 535 1190 535 1115 535",
      ]
    : [
        "M805 455 C690 360 620 310 545 275",
        "M805 615 C690 705 620 755 545 790",
        "M1115 535 C1195 535 1270 535 1375 535",
      ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="trace" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity=".18"/><stop offset=".55" stop-color="#d6a66a" stop-opacity=".72"/><stop offset="1" stop-color="#ffffff" stop-opacity=".24"/></linearGradient>
      <marker id="${marker}" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#d6a66a" fill-opacity=".72"/></marker>
    </defs>
    ${paths.map((d) => `<path d="${d}" fill="none" stroke="url(#trace)" stroke-width="2.2" stroke-linecap="round" marker-end="url(#${marker})"/>`).join("")}
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
}

async function makeStageLabel(outputPath, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="68">
    <text x="210" y="43" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="500" letter-spacing="7" fill="#f3efe8" fill-opacity=".88">${label}</text>
    <path d="M126 58 H294" stroke="#d6a66a" stroke-opacity=".48" stroke-width="1"/>
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
      scene: "13",
      role: "INFORMATION_TO_DECISION_TO_EXECUTION",
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
      primary_intelligence_role: "ORGANIZATION_INTELLIGENCE_SHARED_CONTEXT",
      semantic_sequence: "INFORMATION_INWARD_TO_SHARED_CONTEXT>DECISION_AT_SHARED_CONTEXT>EXECUTION_OUTWARD_TO_BUSINESS",
      visual_signal_policy: "SPATIAL_TRACE_LINES_ONLY_NO_FAKE_DATA",
      real_world_background: "true",
      authentic_product_ui_only: "true",
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

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-scene13-v2-"));
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

    for (const key of ["finance", "customer", "operations"]) {
      panes[key] = path.join(directory, `${key}-pane.png`);
      await makePane(uiFiles[key], panes[key], 470, 272, 17);
    }
    panes.intelligence = path.join(directory, "intelligence-pane.png");
    await makePane(uiFiles.intelligence, panes.intelligence, 780, 442, 23);

    const inbound = path.join(directory, "flow-in.png");
    const outbound = path.join(directory, "flow-out.png");
    const information = path.join(directory, "information.png");
    const decision = path.join(directory, "decision.png");
    const execution = path.join(directory, "execution.png");
    await Promise.all([
      makeFlowLayer(inbound, "in"),
      makeFlowLayer(outbound, "out"),
      makeStageLabel(information, "INFORMATION"),
      makeStageLabel(decision, "DECISION"),
      makeStageLabel(execution, "EXECUTION"),
    ]);

    const final = path.join(directory, "scene13-v2.mp4");
    const filters = [
      `[0:v]scale=1970:1108:force_original_aspect_ratio=increase,crop=${W}:${H}:x='(iw-ow)/2+4*sin(t*0.20)':y='(ih-oh)/2+2*sin(t*0.16)',fps=${FPS},eq=contrast=1.04:brightness=-0.021:saturation=0.84,format=yuv420p[bg]`,
      `[1:v]format=rgba,fade=t=in:st=0.10:d=0.28:alpha=1[pFinance]`,
      `[2:v]format=rgba,fade=t=in:st=0.34:d=0.28:alpha=1[pCustomer]`,
      `[3:v]format=rgba,fade=t=in:st=0.58:d=0.28:alpha=1[pOperations]`,
      `[4:v]format=rgba,fade=t=in:st=0.85:d=0.38:alpha=1[pIntelligence]`,
      `[5:v]format=rgba,fade=t=in:st=0.80:d=0.32:alpha=1,fade=t=out:st=2.65:d=0.52:alpha=1[inFlow]`,
      `[6:v]format=rgba,fade=t=in:st=4.10:d=0.42:alpha=1[outFlow]`,
      `[7:v]format=rgba,fade=t=in:st=0.25:d=0.25:alpha=1,fade=t=out:st=2.18:d=0.34:alpha=1[information]`,
      `[8:v]format=rgba,fade=t=in:st=2.42:d=0.28:alpha=1,fade=t=out:st=4.15:d=0.34:alpha=1[decision]`,
      `[9:v]format=rgba,fade=t=in:st=4.38:d=0.30:alpha=1[execution]`,
      `[bg][pFinance]overlay=x='75+4*sin(t*0.25)':y='140+3*sin(t*0.20)':shortest=1[s1]`,
      `[s1][pCustomer]overlay=x='75+4*sin(t*0.23)':y='690+3*sin(t*0.19)':shortest=1[s2]`,
      `[s2][pOperations]overlay=x='1375+4*sin(t*0.24)':y='404+3*sin(t*0.18)':shortest=1[s3]`,
      `[s3][pIntelligence]overlay=x='570+4*sin(t*0.17)':y='314+3*sin(t*0.16)':shortest=1[s4]`,
      `[s4][inFlow]overlay=0:0:shortest=1[s5]`,
      `[s5][outFlow]overlay=0:0:shortest=1[s6]`,
      `[s6][information]overlay=x=750:y=930:shortest=1[s7]`,
      `[s7][decision]overlay=x=750:y=930:shortest=1[s8]`,
      `[s8][execution]overlay=x=750:y=930:shortest=1,format=yuv420p[v]`,
      `[10:a]atrim=start=${VOICE_START}:end=${VOICE_END},asetpts=PTS-STARTPTS,volume=1.03[voice]`,
      `[11:a]atrim=start=${VOICE_START}:end=${VOICE_END},asetpts=PTS-STARTPTS,volume=0.10[score]`,
      `[voice][score]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95,atrim=duration=${DURATION}[a]`,
    ].join(";");

    await run(ffmpeg, [
      "-y",
      "-stream_loop", "-1", "-ss", "1.2", "-i", manager,
      "-loop", "1", "-framerate", String(FPS), "-i", panes.finance,
      "-loop", "1", "-framerate", String(FPS), "-i", panes.customer,
      "-loop", "1", "-framerate", String(FPS), "-i", panes.operations,
      "-loop", "1", "-framerate", String(FPS), "-i", panes.intelligence,
      "-loop", "1", "-framerate", String(FPS), "-i", inbound,
      "-loop", "1", "-framerate", String(FPS), "-i", outbound,
      "-loop", "1", "-framerate", String(FPS), "-i", information,
      "-loop", "1", "-framerate", String(FPS), "-i", decision,
      "-loop", "1", "-framerate", String(FPS), "-i", execution,
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
      scene: 13,
      role: "INFORMATION_TO_DECISION_TO_EXECUTION",
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
      semantic_sequence: ["INFORMATION_INWARD", "DECISION_AT_SHARED_CONTEXT", "EXECUTION_OUTWARD"],
      rules: {
        real_world_background: true,
        authentic_product_ui_only: true,
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
      scene: 13,
      output_ready: ready,
      output_path: OUTPUT,
      source_quality: "VERIFIED_APPROVED_ONLY",
      semantic_sequence: ["INFORMATION_INWARD", "DECISION_AT_SHARED_CONTEXT", "EXECUTION_OUTWARD"],
    });
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, contract: CONTRACT, error: error?.message || String(error) }, 500);
  }
}
