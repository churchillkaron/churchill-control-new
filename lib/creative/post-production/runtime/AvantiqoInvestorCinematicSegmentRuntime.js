import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import { AVANTIQO_INVESTOR_PRODUCT_PROOF_PLAN } from "./AvantiqoInvestorProductProofPlan";
import { AVANTIQO_INVESTOR_FINAL_ACT_PLAN } from "./AvantiqoInvestorFinalActPlan";

const supabase = getServiceSupabase();
const BUCKET = "creative-assets";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ROOT = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820`;
const UI_MANIFEST_PATH = `${ROOT}/ui/manifest-v1.json`;
const SEGMENT_DIR = `${ROOT}/segments`;
const FOUNDER_DIR = `${ROOT}/founder-v7`;
const PRODUCT_OUTPUT = `${SEGMENT_DIR}/product-proof-final-v1.mp4`;
const FINAL_OUTPUT = `${SEGMENT_DIR}/final-act-final-v1.mp4`;
const OPENING_OUTPUT = `${SEGMENT_DIR}/opening-final-v2.mp4`;
const OPENING_CLEAN_BACKUP = `${SEGMENT_DIR}/opening-final-v2-base-before-founder-hologram.mp4`;
const LOGO_PATH = `${ORGANIZATION_ID}/unassigned/df1cdd49-68e2-4a77-956e-6c9565c0074d-google-veo-6c9upygjkui2.mp4`;

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 24;
const TOLERANCE = 0.25;

const PRODUCT_DIRECT = Object.freeze({
  organization_intelligence: ["organization_intelligence"],
  operations_command_center: ["operations_command_center"],
  supply_chain: ["supply_chain"],
  finance: ["finance"],
  general_ledger_or_accounting_settings: ["general_ledger", "finance_governance_accounting_settings"],
  autonomous_marketing: ["autonomous_marketing"],
  business_objective_to_execution: ["autonomous_marketing", "operations_command_center"],
  customer_communications: ["customer_communications"],
  operations_attention_to_action: ["operations_command_center", "approval_control"],
  pest_control_operations: ["pest_control_operations"],
  restaurant_operations: ["restaurant_operations"],
  hotel_or_generic_operations_shell: ["hotel_operations", "operations_command_center"],
  healthcare_operations: ["healthcare_operations"],
  connected_services_or_field_service: ["integrations_connected_services", "pest_control_operations"],
});

const FINAL_DIRECT = Object.freeze({
  SALE_TO_FINANCE_TO_SUPPLY_TO_PEOPLE_FLOW: ["general_ledger", "supply_chain", "payroll_control_center", "employee_directory"],
  MULTI_INTERFACE_ONE_TRUTH: ["customer_communications", "employee_directory", "supply_chain", "operations_command_center"],
  INTEGRATIONS: ["integrations_connected_services"],
  GOVERNED_AI_CONTEXT: ["organization_intelligence", "finance_governance_accounting_settings", "approval_control", "operations_command_center"],
  AUTHENTIC_WORKING_PRODUCT_PROOF: ["autonomous_marketing", "operations_command_center", "general_ledger", "pest_control_operations", "healthcare_operations"],
  VERTICAL_ENTRY_HORIZONTAL_EXPANSION: ["pest_control_operations", "restaurant_operations", "finance", "employee_directory", "supply_chain", "integrations_connected_services"],
});

const PRODUCT_CARDS = Object.freeze({
  UNDERSTAND_RECOMMEND_APPROVE_EXECUTE: ["AVANTIQO INTELLIGENCE", "UNDERSTAND · RECOMMEND · APPROVE · EXECUTE", "Operating context becomes accountable action."],
  NOT_ONE_VERTICAL: ["CROSS-INDUSTRY BY DESIGN", "NOT ONE VERTICAL", "Enter deeply. Expand through the same operating architecture."],
  ONE_OPERATING_ARCHITECTURE: ["ONE OPERATING ARCHITECTURE", "DIFFERENT INDUSTRIES · ONE SYSTEM", "Context, decisions and execution stay connected."],
});

const FINAL_CARDS = Object.freeze({
  AVANTIQO_INTELLIGENCE: ["SHARED OPERATING CONTEXT", "AVANTIQO INTELLIGENCE", "The business stops looking like fragments."],
});

const FOUNDER_FILES = Object.freeze({
  "integration-01": "founder-mid-integration-synced-approved-v7.mp4",
  "ai-01": "founder-mid-ai-synced-approved-v7.mp4",
  "close-01": "founder-close-synced-approved-v7.mp4",
  "close-02": "founder-close-synced-approved-v7.mp4",
});

function run(command, args, timeoutMs = 290000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1" },
    });
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("INVESTOR_CINEMATIC_RENDER_TIMEOUT"));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      const trace = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) reject(new Error(trace.slice(-14000) || `FFMPEG_EXIT_${code}`));
      else resolve(trace);
    });
  });
}

function durationFromTrace(value) {
  const match = String(value || "").match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

async function mediaDuration(ffmpeg, source) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ["-hide_banner", "-i", source], { shell: false, stdio: ["ignore", "ignore", "pipe"] });
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", () => {
      const duration = durationFromTrace(Buffer.concat(stderr).toString("utf8"));
      if (!duration) reject(new Error(`MEDIA_DURATION_UNAVAILABLE:${source}`));
      else resolve(duration);
    });
  });
}

async function storageExists(storagePath) {
  const directory = path.posix.dirname(storagePath);
  const filename = path.posix.basename(storagePath);
  const { data, error } = await supabase.storage.from(BUCKET).list(directory, { search: filename, limit: 10 });
  if (error) return false;
  return (data || []).some((row) => row.name === filename);
}

async function download(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`CINEMATIC_SOURCE_EMPTY:${storagePath}`);
  const bytes = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(localPath, bytes);
  return bytes;
}

async function upload(storagePath, localPath, metadata = {}) {
  const bytes = await fs.readFile(localPath);
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4",
    cacheControl: "3600",
    upsert: true,
    metadata: {
      organization_id: ORGANIZATION_ID,
      investor_film: "20260820",
      visual_pass: "CINEMATIC_GLASS_V3",
      full_screen_screenshot_montage: "false",
      founder_source: "FOUNDER_V7",
      ...metadata,
    },
  });
  if (error) throw error;
  return { bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
}

async function signedUrl(storagePath, seconds = 86400) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function readManifest() {
  const { data, error } = await supabase.storage.from(BUCKET).download(UI_MANIFEST_PATH);
  if (error) throw error;
  if (!data) throw new Error("INVESTOR_UI_MANIFEST_EMPTY");
  const manifest = JSON.parse(Buffer.from(await data.arrayBuffer()).toString("utf8"));
  if (manifest?.synthetic_ui_allowed !== false) throw new Error("INVESTOR_UI_POLICY_INVALID");
  return manifest;
}

function slot(manifest, key) { return manifest?.slots?.[key] || null; }
function available(manifest, keys = []) { return keys.filter((key) => slot(manifest, key)?.normalized_path); }

function escapeXml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

async function roundedPanel(imageBuffer, width, height, radius = 28) {
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" fill="white"/></svg>`);
  return sharp(imageBuffer).resize(width, height, { fit: "cover" }).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

async function makeCinematicUiFrame(directory, name, sourceBuffers, accent = "#8eeeff") {
  const target = path.join(directory, `${name}-cinematic.jpg`);
  const primary = sourceBuffers[0];
  const bg = await sharp(primary).resize(WIDTH, HEIGHT, { fit: "cover" }).blur(28).modulate({ brightness: 0.25, saturation: 0.55 }).jpeg({ quality: 92 }).toBuffer();
  const hero = await roundedPanel(primary, 1010, 568, 30);

  const frameSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
      <defs>
        <radialGradient id="halo" cx="50%" cy="48%" r="58%"><stop offset="0" stop-color="${accent}" stop-opacity=".16"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#020509" stop-opacity=".28"/><stop offset="1" stop-color="#010205" stop-opacity=".72"/></linearGradient>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="#020509" fill-opacity=".44"/>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#shade)"/>
      <ellipse cx="640" cy="390" rx="560" ry="300" fill="url(#halo)"/>
      <rect x="122" y="74" width="1036" height="594" rx="38" fill="none" stroke="${accent}" stroke-opacity=".22" stroke-width="2"/>
      <rect x="132" y="84" width="1016" height="574" rx="32" fill="#071019" fill-opacity=".18" stroke="#ffffff" stroke-opacity=".07"/>
      <line x1="208" y1="688" x2="1072" y2="688" stroke="${accent}" stroke-opacity=".20"/>
      <circle cx="180" cy="688" r="3" fill="${accent}" fill-opacity=".72"/>
      <circle cx="1100" cy="688" r="3" fill="${accent}" fill-opacity=".72"/>
    </svg>`);

  const layers = [
    { input: frameSvg, left: 0, top: 0 },
    { input: hero, left: 135, top: 87 },
  ];

  if (sourceBuffers[1]) {
    const secondary = await roundedPanel(sourceBuffers[1], 390, 219, 20);
    const secondaryBorder = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="414" height="243"><rect x="1" y="1" width="412" height="241" rx="24" fill="#071019" fill-opacity=".20" stroke="${accent}" stroke-opacity=".32"/></svg>`);
    layers.push({ input: secondaryBorder, left: 828, top: 438 });
    layers.push({ input: secondary, left: 840, top: 450 });
  }

  await sharp(bg).composite(layers).jpeg({ quality: 96, chromaSubsampling: "4:4:4" }).toFile(target);
  return target;
}

async function makeTitleFrame(directory, name, card) {
  const [eyebrow, title, detail] = card;
  const target = path.join(directory, `${name}-title.jpg`);
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
      <defs><radialGradient id="bg" cx="50%" cy="46%" r="75%"><stop offset="0" stop-color="#10212b"/><stop offset=".52" stop-color="#060a0f"/><stop offset="1" stop-color="#010204"/></radialGradient></defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
      <circle cx="640" cy="270" r="52" fill="none" stroke="#8eeeff" stroke-opacity=".22"/><circle cx="640" cy="270" r="22" fill="#8eeeff" fill-opacity=".05" stroke="#d8fbff" stroke-opacity=".30"/>
      <line x1="390" y1="334" x2="890" y2="334" stroke="#8eeeff" stroke-opacity=".28"/>
      <text x="640" y="370" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" letter-spacing="3" fill="#9eeeff">${escapeXml(eyebrow)}</text>
      <text x="640" y="432" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="35" font-weight="700" letter-spacing="1" fill="#ffffff">${escapeXml(title)}</text>
      <text x="640" y="475" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="#b4c0c8">${escapeXml(detail)}</text>
    </svg>`);
  await sharp(svg).jpeg({ quality: 96, chromaSubsampling: "4:4:4" }).toFile(target);
  return target;
}

async function renderFrame(ffmpeg, source, output, duration) {
  await run(ffmpeg, [
    "-y", "-loop", "1", "-framerate", String(FPS), "-i", source,
    "-t", String(duration), "-an",
    "-vf", `scale=${WIDTH}:${HEIGHT}:flags=lanczos,fps=${FPS},fade=t=in:st=0:d=0.20,fade=t=out:st=${Math.max(0, duration - 0.22)}:d=0.22,format=yuv420p`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", output,
  ]);
}

async function renderLogo(ffmpeg, logoLocal, output, duration) {
  await run(ffmpeg, [
    "-y", "-stream_loop", "-1", "-i", logoLocal, "-t", String(duration), "-an",
    "-vf", `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},fps=${FPS},format=yuv420p`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", output,
  ]);
}

async function makeFounderGlass(directory, name, mode = "default") {
  const target = path.join(directory, `${name}-founder-glass.rgba`);
  const accent = mode === "ai" ? "#9ad9ff" : "#8eeeff";
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
      <defs>
        <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${accent}" stop-opacity=".11"/><stop offset=".5" stop-color="#ffffff" stop-opacity=".025"/><stop offset="1" stop-color="${accent}" stop-opacity=".055"/></linearGradient>
        <radialGradient id="halo"><stop offset="0" stop-color="${accent}" stop-opacity=".22"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <ellipse cx="640" cy="642" rx="245" ry="48" fill="url(#halo)"/>
      <ellipse cx="640" cy="634" rx="145" ry="24" fill="none" stroke="${accent}" stroke-opacity=".34"/>
      <ellipse cx="640" cy="634" rx="86" ry="14" fill="none" stroke="#d9fbff" stroke-opacity=".25"/>
      <g opacity=".78">
        <path d="M54 230 Q54 178 106 178 H330 Q370 178 370 218 V492 Q370 532 330 532 H106 Q54 532 54 480 Z" fill="url(#glass)" stroke="${accent}" stroke-opacity=".30"/>
        <path d="M910 196 Q910 156 950 156 H1186 Q1228 156 1228 198 V470 Q1228 514 1184 514 H950 Q910 514 910 474 Z" fill="url(#glass)" stroke="${accent}" stroke-opacity=".30"/>
      </g>
      <g stroke="${accent}" stroke-opacity=".34" fill="none">
        <circle cx="116" cy="250" r="11"/><circle cx="222" cy="305" r="8"/><circle cx="317" cy="240" r="10"/><circle cx="145" cy="410" r="9"/><circle cx="300" cy="452" r="7"/>
        <line x1="116" y1="250" x2="222" y2="305"/><line x1="222" y1="305" x2="317" y2="240"/><line x1="222" y1="305" x2="145" y2="410"/><line x1="145" y1="410" x2="300" y2="452"/>
        <circle cx="982" cy="230" r="9"/><circle cx="1080" cy="284" r="12"/><circle cx="1172" cy="230" r="8"/><circle cx="1016" cy="418" r="8"/><circle cx="1146" cy="432" r="10"/>
        <line x1="982" y1="230" x2="1080" y2="284"/><line x1="1080" y1="284" x2="1172" y2="230"/><line x1="1080" y1="284" x2="1016" y2="418"/><line x1="1016" y1="418" x2="1146" y2="432"/>
      </g>
      <g fill="#d8fbff" filter="url(#glow)"><circle cx="222" cy="305" r="3"/><circle cx="1080" cy="284" r="3"/><circle cx="640" cy="634" r="4"/></g>
      <g stroke="#ffffff" stroke-opacity=".08"><line x1="78" y1="204" x2="346" y2="204"/><line x1="934" y1="182" x2="1204" y2="182"/></g>
    </svg>`);
  const raw = await sharp(svg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  await fs.writeFile(target, raw.data);
  return { path: target, width: raw.info.width, height: raw.info.height };
}

async function renderFounder(ffmpeg, directory, beat, output) {
  const filename = FOUNDER_FILES[beat.id];
  if (!filename) throw new Error(`FOUNDER_V7_MAPPING_REQUIRED:${beat.id}`);
  const sourcePath = `${FOUNDER_DIR}/${filename}`;
  if (!(await storageExists(sourcePath))) throw new Error(`FOUNDER_V7_NOT_READY:${beat.id}`);
  const source = path.join(directory, `${beat.id}-founder-v7.mp4`);
  await download(sourcePath, source);
  const glass = await makeFounderGlass(directory, beat.id, beat.id === "ai-01" ? "ai" : "default");
  const offset = beat.id === "close-02" ? (AVANTIQO_INVESTOR_FINAL_ACT_PLAN.beats.find((b) => b.id === "close-01")?.duration || 0) : 0;
  const args = ["-y"];
  if (offset > 0) args.push("-ss", String(offset));
  args.push(
    "-stream_loop", "-1", "-i", source,
    "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${glass.width}x${glass.height}`, "-framerate", String(FPS), "-stream_loop", "-1", "-i", glass.path,
    "-t", String(beat.duration), "-an",
    "-filter_complex", `[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},fps=${FPS}[base];[1:v]format=rgba,colorchannelmixer=aa=0.72[glass];[base][glass]overlay=x='3*sin(t*0.28)':y='2*cos(t*0.31)':format=auto,vignette=PI/7:0.12,format=yuv420p[out]`,
    "-map", "[out]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(FPS), output,
  );
  await run(ffmpeg, args);
}

async function renderUiBeat(ffmpeg, directory, manifest, beat, keys, output) {
  const keysReady = available(manifest, keys);
  if (!keysReady.length) throw new Error(`CINEMATIC_UI_NOT_READY:${beat.id}`);
  const count = beat.duration >= 9 ? Math.min(3, keysReady.length) : beat.duration >= 6 ? Math.min(2, keysReady.length) : 1;
  const selected = keysReady.slice(0, count);
  const clipDuration = beat.duration / selected.length;
  const clips = [];

  for (let i = 0; i < selected.length; i += 1) {
    const primaryKey = selected[i];
    const secondaryKey = selected.length > 1 ? selected[(i + 1) % selected.length] : null;
    const primaryItem = slot(manifest, primaryKey);
    const primaryPath = path.join(directory, `${beat.id}-${i}-${primaryKey}.png`);
    await download(primaryItem.normalized_path, primaryPath);
    const primaryBuffer = await fs.readFile(primaryPath);
    const buffers = [primaryBuffer];
    if (secondaryKey && secondaryKey !== primaryKey) {
      const secondaryItem = slot(manifest, secondaryKey);
      const secondaryPath = path.join(directory, `${beat.id}-${i}-${secondaryKey}-secondary.png`);
      await download(secondaryItem.normalized_path, secondaryPath);
      buffers.push(await fs.readFile(secondaryPath));
    }
    const frame = await makeCinematicUiFrame(directory, `${beat.id}-${i}`, buffers, i % 2 ? "#d8b970" : "#8eeeff");
    const clip = path.join(directory, `${beat.id}-${i}.mp4`);
    await renderFrame(ffmpeg, frame, clip, clipDuration);
    clips.push(clip);
  }
  await concat(ffmpeg, clips, output, directory, `${beat.id}-concat`);
}

async function concat(ffmpeg, clips, output, directory, name) {
  const list = path.join(directory, `${name}.txt`);
  await fs.writeFile(list, clips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
  await run(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", output]);
}

async function renderPlan(plan, kind, outputPath) {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");
  const manifest = await readManifest();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), `investor-cinematic-${kind}-`));
  try {
    let logoLocal = null;
    if (kind === "final-act") {
      logoLocal = path.join(directory, "logo.mp4");
      await download(LOGO_PATH, logoLocal);
    }
    const clips = [];
    for (const [index, beat] of plan.beats.entries()) {
      const output = path.join(directory, `${String(index).padStart(2, "0")}-${beat.id}.mp4`);
      const card = kind === "product-proof" ? PRODUCT_CARDS[beat.visual] : FINAL_CARDS[beat.visual];
      if (beat.visual === "FOUNDER") {
        await renderFounder(ffmpeg, directory, beat, output);
      } else if (beat.visual === "APPROVED_3D_AVANTIQO_LOGO" || beat.visual === "APPROVED_3D_AVANTIQO_LOGO_FINAL_HOLD") {
        await renderLogo(ffmpeg, logoLocal, output, beat.duration);
      } else if (card) {
        const frame = await makeTitleFrame(directory, beat.id, card);
        await renderFrame(ffmpeg, frame, output, beat.duration);
      } else {
        const map = kind === "product-proof" ? PRODUCT_DIRECT : FINAL_DIRECT;
        const keys = map[beat.visual];
        if (!keys) throw new Error(`CINEMATIC_VISUAL_MAPPING_REQUIRED:${beat.visual}`);
        await renderUiBeat(ffmpeg, directory, manifest, beat, keys, output);
      }
      clips.push(output);
    }
    const finished = path.join(directory, `${kind}-cinematic-v3.mp4`);
    await concat(ffmpeg, clips, finished, directory, `${kind}-final`);
    const actual = await mediaDuration(ffmpeg, finished);
    if (Math.abs(actual - plan.target_duration_seconds) > TOLERANCE) throw new Error(`${kind.toUpperCase()}_DURATION_INVALID:${actual}`);
    const stored = await upload(outputPath, finished, { segment: kind, ui_treatment: "CRISP_AUTHENTIC_UI_IN_GLASS_SCENE" });
    return { success: true, kind, output_path: outputPath, bytes: stored.bytes, sha256: stored.sha256, duration_seconds: actual, signed_url: await signedUrl(outputPath) };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

async function renderOpeningFounderGlass() {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "investor-opening-glass-v3-"));
  try {
    const source = path.join(directory, "opening-clean.mp4");
    const output = path.join(directory, "opening-glass.mp4");
    const basePath = await storageExists(OPENING_CLEAN_BACKUP) ? OPENING_CLEAN_BACKUP : OPENING_OUTPUT;
    await download(basePath, source);
    const glass = await makeFounderGlass(directory, "opening-founder", "default");
    await run(ffmpeg, [
      "-y", "-i", source,
      "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${glass.width}x${glass.height}`, "-framerate", String(FPS), "-stream_loop", "-1", "-i", glass.path,
      "-filter_complex", `[0:v]scale=${WIDTH}:${HEIGHT},fps=${FPS}[base];[1:v]format=rgba,colorchannelmixer=aa=0.70[glass];[base][glass]overlay=x='3*sin(t*0.28)':y='2*cos(t*0.31)':enable='between(t,8,19.391)':format=auto,format=yuv420p[out]`,
      "-map", "[out]", "-an", "-t", "48.078", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", output,
    ]);
    const actual = await mediaDuration(ffmpeg, output);
    if (Math.abs(actual - 48.078) > TOLERANCE) throw new Error(`OPENING_DURATION_INVALID:${actual}`);
    const stored = await upload(OPENING_OUTPUT, output, { segment: "opening", founder_glass: "SIDE_SPATIAL_AROUND_FOUNDER" });
    return { success: true, kind: "opening", output_path: OPENING_OUTPUT, bytes: stored.bytes, sha256: stored.sha256, duration_seconds: actual, signed_url: await signedUrl(OPENING_OUTPUT) };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export async function getAvantiqoInvestorCinematicV3Status() {
  return {
    success: true,
    contract: "AVANTIQO_INVESTOR_CINEMATIC_GLASS_V3",
    founder_source: "FOUNDER_V7",
    full_screen_screenshot_montage_allowed: false,
    authentic_ui_policy: "REAL_UI_PRESERVED_AS_CRISP_GLASS_PANELS",
    founder_glass_policy: "LEFT_RIGHT_SPATIAL_GLASS_CENTER_FACE_CLEAR",
    outputs: {
      opening: { path: OPENING_OUTPUT, ready: await storageExists(OPENING_OUTPUT) },
      product_proof: { path: PRODUCT_OUTPUT, ready: await storageExists(PRODUCT_OUTPUT) },
      final_act: { path: FINAL_OUTPUT, ready: await storageExists(FINAL_OUTPUT) },
    },
  };
}

export async function renderAvantiqoInvestorCinematicV3(scope = "all") {
  const results = [];
  if (scope === "all" || scope === "opening") results.push(await renderOpeningFounderGlass());
  if (scope === "all" || scope === "product") results.push(await renderPlan(AVANTIQO_INVESTOR_PRODUCT_PROOF_PLAN, "product-proof", PRODUCT_OUTPUT));
  if (scope === "all" || scope === "final") results.push(await renderPlan(AVANTIQO_INVESTOR_FINAL_ACT_PLAN, "final-act", FINAL_OUTPUT));
  return { success: true, contract: "AVANTIQO_INVESTOR_CINEMATIC_GLASS_V3", results };
}

export const AvantiqoInvestorCinematicSegmentRuntime = Object.freeze({
  status: getAvantiqoInvestorCinematicV3Status,
  render: renderAvantiqoInvestorCinematicV3,
});
