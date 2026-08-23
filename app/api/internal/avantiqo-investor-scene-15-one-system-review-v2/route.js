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

const TOKEN = "avq-investor-scene-15-one-system-review-v2-20260823";
const CONTRACT = "AVANTIQO_INVESTOR_SCENE_15_ONE_SYSTEM_REVIEW_V2";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const W = 1920;
const H = 1080;
const FPS = 24;
const DURATION = 5.484;
const VOICE_START = 67.5;
const VOICE_END = 72.984;
const NARRATION = "That shared context turns separate workspaces into one system.";

const MANAGER = `${ORG}/unassigned/61b4afe1-93ae-4e1e-a92f-60dff5d629be-avantiqo-investor-manager-ee25292e-4fd3-4249-81cb-3ab526fd2048.mp4`;
const MANAGER_ASSET_ID = "57f2aee6-6950-43e6-b4f6-9940905ded12";
const VOICE = `${ORG}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3`;
const SCORE = `${ORG}/avantiqo-investor-film-20260820/audio/avantiqo-investor-score-v1-approved.mp3`;

const UI = Object.freeze({
  organization: {
    path: `${ORG}/avantiqo-investor-film-20260820/ui/organization_intelligence.png`,
    asset_id: "6d719949-d319-4bbb-b2fd-f736c3e4ca95",
    role: "ORGANIZATION_INTELLIGENCE",
  },
  operations: {
    path: `${ORG}/avantiqo-investor-film-20260820/ui/operations_command_center.png`,
    asset_id: "7b6e46c4-694e-40ba-bef6-489f9d5e52ac",
    role: "OPERATIONS_COMMAND_CENTER",
  },
  finance: {
    path: `${ORG}/avantiqo-investor-film-20260820/ui/finance.png`,
    asset_id: "ec166c5d-55ac-44f4-a7eb-5b6c03dab36f",
    role: "FINANCE",
  },
  supply: {
    path: `${ORG}/avantiqo-investor-film-20260820/ui/supply_chain.png`,
    asset_id: "6c72782b-c95b-485c-a13d-964d9918c19f",
    role: "SUPPLY_CHAIN",
  },
  customer: {
    path: `${ORG}/avantiqo-investor-film-20260820/ui/customer_communications.png`,
    asset_id: "6be3322f-1169-4d9e-86d9-ce8f67d26222",
    role: "CUSTOMER_COMMUNICATIONS",
  },
});

const OUTPUT = `${ORG}/${PROJECT}/scene-previews-20260823/scene-15-one-shared-system-review-v2.mp4`;
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
        reject(new Error("SCENE_15_V2_REVIEW_TIMEOUT"));
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
  if (!data) throw new Error(`SCENE_15_V2_SOURCE_EMPTY:${storagePath}`);
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
    <defs><linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".44"/><stop offset=".5" stop-color="#d6a66a" stop-opacity=".29"/><stop offset="1" stop-color="#ffffff" stop-opacity=".10"/></linearGradient></defs>
    <rect x="5" y="5" width="${width - 10}" height="${height - 10}" rx="${radius + 6}" fill="#07080a" fill-opacity=".23" stroke="url(#edge)" stroke-width="1.3"/>
    <path d="M22 16 H${width - 27}" stroke="#ffffff" stroke-opacity=".16" stroke-width="2" stroke-linecap="round"/>
  </svg>`);
  await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: masked, left: inset, top: inset }, { input: frame }])
    .png()
    .toFile(outputPath);
}

async function makeConnectiveField(outputPath) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".10"/><stop offset=".52" stop-color="#d6a66a" stop-opacity=".48"/><stop offset="1" stop-color="#ffffff" stop-opacity=".12"/></linearGradient>
      <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
    </defs>
    <g fill="none" stroke="url(#g1)" stroke-width="1.6" stroke-linecap="round">
      <path d="M410 320 C620 360 700 420 780 480"/>
      <path d="M1510 320 C1300 360 1220 420 1140 480"/>
      <path d="M410 760 C620 705 700 650 780 595"/>
      <path d="M1510 760 C1300 705 1220 650 1140 595"/>
    </g>
    <circle cx="960" cy="540" r="302" fill="none" stroke="#d6a66a" stroke-opacity=".10" stroke-width="10" filter="url(#soft)"/>
    <circle cx="960" cy="540" r="300" fill="none" stroke="#d6a66a" stroke-opacity=".28" stroke-width="1.1"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
}

async function makeOneSystemLabel(outputPath) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="82">
    <text x="350" y="40" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="500" letter-spacing="7" fill="#f3efe8" fill-opacity=".88">ONE SHARED SYSTEM</text>
    <path d="M195 60 H505" stroke="#d6a66a" stroke-opacity=".50" stroke-width="1"/>
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
      scene: "15",
      role: "SEPARATE_WORKSPACES_BECOME_ONE_SHARED_SYSTEM",
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
      primary_visual: "ORGANIZATION_INTELLIGENCE",
      workspace_sequence: "OPERATIONS+FINANCE THEN SUPPLY_CHAIN+CUSTOMER_COMMUNICATIONS THEN CONNECTED_ORGANIZATION_CONTEXT",
      convergence_model: "SPATIAL_WORKSPACES_TO_ONE_SHARED_CONTEXT",
      label_is_editorial_not_product_ui: "true",
      real_world_background: "true",
      authentic_product_ui_only: "true",
      simultaneous_support_panes_max: "2",
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

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-scene15-v2-"));
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

    for (const key of ["operations", "finance", "supply", "customer"]) {
      panes[key] = path.join(directory, `${key}-pane.png`);
      await makePane(uiFiles[key], panes[key], 500, 288, 17);
    }
    panes.organization = path.join(directory, "organization-pane.png");
    await makePane(uiFiles.organization, panes.organization, 900, 510, 23);

    const field = path.join(directory, "connective-field.png");
    const label = path.join(directory, "one-system-label.png");
    await Promise.all([makeConnectiveField(field), makeOneSystemLabel(label)]);

    const final = path.join(directory, "scene15-v2.mp4");
    const filters = [
      `[0:v]scale=1970:1108:force_original_aspect_ratio=increase,crop=${W}:${H}:x='(iw-ow)/2+4*sin(t*0.19)':y='(ih-oh)/2+2*sin(t*0.15)',fps=${FPS},eq=contrast=1.04:brightness=-0.021:saturation=0.84,format=yuv420p[bg]`,
      `[1:v]format=rgba,fade=t=in:st=0.10:d=0.24:alpha=1,fade=t=out:st=1.95:d=0.40:alpha=1[pOperations]`,
      `[2:v]format=rgba,fade=t=in:st=0.32:d=0.24:alpha=1,fade=t=out:st=2.02:d=0.40:alpha=1[pFinance]`,
      `[3:v]format=rgba,fade=t=in:st=1.92:d=0.26:alpha=1,fade=t=out:st=3.42:d=0.42:alpha=1[pSupply]`,
      `[4:v]format=rgba,fade=t=in:st=2.14:d=0.26:alpha=1,fade=t=out:st=3.49:d=0.42:alpha=1[pCustomer]`,
      `[5:v]format=rgba,fade=t=in:st=3.16:d=0.36:alpha=1[pField]`,
      `[6:v]format=rgba,fade=t=in:st=3.34:d=0.42:alpha=1[pOrganization]`,
      `[7:v]format=rgba,fade=t=in:st=4.05:d=0.30:alpha=1[pLabel]`,
      `[bg][pOperations]overlay=x='130+4*sin(t*0.23)':y='225+3*sin(t*0.18)':shortest=1[s1]`,
      `[s1][pFinance]overlay=x='1290+4*sin(t*0.22)':y='225+3*sin(t*0.17)':shortest=1[s2]`,
      `[s2][pSupply]overlay=x='130+4*sin(t*0.21)':y='590+3*sin(t*0.16)':shortest=1[s3]`,
      `[s3][pCustomer]overlay=x='1290+4*sin(t*0.20)':y='590+3*sin(t*0.15)':shortest=1[s4]`,
      `[s4][pField]overlay=0:0:shortest=1[s5]`,
      `[s5][pOrganization]overlay=x='510+4*sin(t*0.16)':y='285+3*sin(t*0.14)':shortest=1[s6]`,
      `[s6][pLabel]overlay=x=610:y=905:shortest=1,format=yuv420p[v]`,
      `[8:a]atrim=start=${VOICE_START}:end=${VOICE_END},asetpts=PTS-STARTPTS,volume=1.03[voice]`,
      `[9:a]atrim=start=${VOICE_START}:end=${VOICE_END},asetpts=PTS-STARTPTS,volume=0.10[score]`,
      `[voice][score]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95,atrim=duration=${DURATION}[a]`,
    ].join(";");

    await run(ffmpeg, [
      "-y",
      "-stream_loop", "-1", "-ss", "2.0", "-i", manager,
      "-loop", "1", "-framerate", String(FPS), "-i", panes.operations,
      "-loop", "1", "-framerate", String(FPS), "-i", panes.finance,
      "-loop", "1", "-framerate", String(FPS), "-i", panes.supply,
      "-loop", "1", "-framerate", String(FPS), "-i", panes.customer,
      "-loop", "1", "-framerate", String(FPS), "-i", field,
      "-loop", "1", "-framerate", String(FPS), "-i", panes.organization,
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
      scene: 15,
      role: "SEPARATE_WORKSPACES_BECOME_ONE_SHARED_SYSTEM",
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
      semantic_sequence: [
        "OPERATIONS_AND_FINANCE_ARE_SEPARATE_WORKSPACES",
        "SUPPLY_AND_CUSTOMERS_ARE_SEPARATE_WORKSPACES",
        "SHARED_CONTEXT_CONNECTS_THEM",
        "ONE_SHARED_SYSTEM",
      ],
      rules: {
        real_world_background: true,
        authentic_product_ui_only: true,
        simultaneous_support_panes_max: 2,
        label_is_editorial_not_product_ui: true,
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
      scene: 15,
      output_ready: ready,
      output_path: OUTPUT,
      source_quality: "VERIFIED_APPROVED_ONLY",
      semantic_sequence: [
        "OPERATIONS_AND_FINANCE_ARE_SEPARATE_WORKSPACES",
        "SUPPLY_AND_CUSTOMERS_ARE_SEPARATE_WORKSPACES",
        "SHARED_CONTEXT_CONNECTS_THEM",
        "ONE_SHARED_SYSTEM",
      ],
    });
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, contract: CONTRACT, error: error?.message || String(error) }, 500);
  }
}
