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
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const ROOT = `${ORG}/avantiqo-investor-film-20260820`;
const UI_MANIFEST_PATH = `${ROOT}/ui/manifest-v1.json`;
const SEGMENT_DIR = `${ROOT}/segments`;
const FOUNDER_DIR = `${ROOT}/founder-v7`;
const PRODUCT_OUTPUT = `${SEGMENT_DIR}/product-proof-final-v1.mp4`;
const FINAL_OUTPUT = `${SEGMENT_DIR}/final-act-final-v1.mp4`;
const LOGO_PATH = `${ORG}/unassigned/df1cdd49-68e2-4a77-956e-6c9565c0074d-google-veo-6c9upygjkui2.mp4`;

const W = 1280;
const H = 720;
const FPS = 24;
const TOLERANCE = 0.25;

const PRODUCT_MAP = Object.freeze({
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

const FINAL_MAP = Object.freeze({
  SALE_TO_FINANCE_TO_SUPPLY_TO_PEOPLE_FLOW: ["general_ledger", "supply_chain", "payroll_control_center", "employee_directory"],
  MULTI_INTERFACE_ONE_TRUTH: ["customer_communications", "employee_directory", "supply_chain", "operations_command_center"],
  INTEGRATIONS: ["integrations_connected_services"],
  GOVERNED_AI_CONTEXT: ["organization_intelligence", "finance_governance_accounting_settings", "approval_control", "operations_command_center"],
  AUTHENTIC_WORKING_PRODUCT_PROOF: ["autonomous_marketing", "operations_command_center", "general_ledger", "pest_control_operations", "healthcare_operations"],
  VERTICAL_ENTRY_HORIZONTAL_EXPANSION: ["pest_control_operations", "restaurant_operations", "finance", "employee_directory", "supply_chain", "integrations_connected_services"],
});

const PRODUCT_CARDS = Object.freeze({
  UNDERSTAND_RECOMMEND_APPROVE_EXECUTE: ["AVANTIQO INTELLIGENCE", "UNDERSTAND · RECOMMEND · APPROVE · EXECUTE", "Operating context becomes accountable action."],
  NOT_ONE_VERTICAL: ["CROSS-INDUSTRY BY DESIGN", "NOT ONE VERTICAL", "Enter deeply. Expand through one operating architecture."],
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
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("INVESTOR_CINEMATIC_V4_TIMEOUT")); }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-14000) || `FFMPEG_EXIT_${code}`));
      else resolve(true);
    });
  });
}

function durationFromTrace(value) {
  const m = String(value || "").match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
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

async function exists(storagePath) {
  const dir = path.posix.dirname(storagePath);
  const file = path.posix.basename(storagePath);
  const { data, error } = await supabase.storage.from(BUCKET).list(dir, { search: file, limit: 10 });
  if (error) return false;
  return (data || []).some((row) => row.name === file);
}

async function download(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`CINEMATIC_V4_SOURCE_EMPTY:${storagePath}`);
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
      organization_id: ORG,
      investor_film: "20260820",
      visual_pass: "CINEMATIC_SPATIAL_V4",
      full_screen_screenshot_montage: "false",
      founder_hologram_card: "false",
      founder_hologram_text: "false",
      founder_source: "FOUNDER_V7",
      ...metadata,
    },
  });
  if (error) throw error;
  return { bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
}

async function signedUrl(storagePath) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 86400);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function manifest() {
  const { data, error } = await supabase.storage.from(BUCKET).download(UI_MANIFEST_PATH);
  if (error) throw error;
  if (!data) throw new Error("UI_MANIFEST_EMPTY");
  const parsed = JSON.parse(Buffer.from(await data.arrayBuffer()).toString("utf8"));
  if (parsed?.synthetic_ui_allowed !== false) throw new Error("UI_MANIFEST_POLICY_INVALID");
  return parsed;
}

function slot(m, key) { return m?.slots?.[key] || null; }
function readyKeys(m, keys) { return keys.filter((key) => slot(m, key)?.normalized_path); }
function esc(v) { return String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

async function rounded(buffer, width, height, radius) {
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" fill="white"/></svg>`);
  return sharp(buffer).resize(width, height, { fit: "cover" }).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

async function productFrame(dir, name, buffers, accent = "#8eeeff") {
  const target = path.join(dir, `${name}.jpg`);
  const bg = await sharp(buffers[0]).resize(W, H, { fit: "cover" }).blur(34).modulate({ brightness: 0.18, saturation: 0.48 }).jpeg({ quality: 90 }).toBuffer();
  const hero = await rounded(buffers[0], 930, 523, 30);
  const shell = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>
        <radialGradient id="h" cx="50%" cy="48%" r="60%"><stop offset="0" stop-color="${accent}" stop-opacity=".14"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
        <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#010309" stop-opacity=".20"/><stop offset="1" stop-color="#010205" stop-opacity=".72"/></linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#s)"/>
      <ellipse cx="640" cy="380" rx="590" ry="305" fill="url(#h)"/>
      <path d="M150 108 Q150 82 176 82 H1086 Q1112 82 1112 108 V604 Q1112 630 1086 630 H176 Q150 630 150 604 Z" fill="#071019" fill-opacity=".17" stroke="${accent}" stroke-opacity=".24" stroke-width="1.4"/>
      <path d="M125 652 H1155" stroke="${accent}" stroke-opacity=".14"/>
      <circle cx="114" cy="652" r="3" fill="${accent}" fill-opacity=".58"/><circle cx="1166" cy="652" r="3" fill="${accent}" fill-opacity=".58"/>
    </svg>`);
  const layers = [{ input: shell }, { input: hero, left: 175, top: 104 }];
  if (buffers[1]) {
    const secondary = await rounded(buffers[1], 310, 174, 18);
    const miniGlow = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="334" height="198"><rect x="1" y="1" width="332" height="196" rx="22" fill="#071019" fill-opacity=".28" stroke="${accent}" stroke-opacity=".34"/></svg>`);
    layers.push({ input: miniGlow, left: 900, top: 476 });
    layers.push({ input: secondary, left: 912, top: 488 });
  }
  await sharp(bg).composite(layers).jpeg({ quality: 97, chromaSubsampling: "4:4:4" }).toFile(target);
  return target;
}

async function titleFrame(dir, name, card) {
  const [eyebrow, title, detail] = card;
  const target = path.join(dir, `${name}.jpg`);
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs><radialGradient id="b" cx="50%" cy="45%" r="78%"><stop offset="0" stop-color="#10212b"/><stop offset=".5" stop-color="#05090e"/><stop offset="1" stop-color="#010204"/></radialGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#b)"/>
      <circle cx="640" cy="260" r="55" fill="none" stroke="#8eeeff" stroke-opacity=".20"/><circle cx="640" cy="260" r="9" fill="#c8f8ff" fill-opacity=".55"/>
      <line x1="430" y1="330" x2="850" y2="330" stroke="#8eeeff" stroke-opacity=".25"/>
      <text x="640" y="368" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="700" letter-spacing="3" fill="#9eeeff">${esc(eyebrow)}</text>
      <text x="640" y="426" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="35" font-weight="700" fill="#ffffff">${esc(title)}</text>
      <text x="640" y="469" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="16" fill="#b5c0c8">${esc(detail)}</text>
    </svg>`);
  await sharp(svg).jpeg({ quality: 97, chromaSubsampling: "4:4:4" }).toFile(target);
  return target;
}

async function renderStill(ffmpeg, source, output, duration) {
  await run(ffmpeg, [
    "-y", "-loop", "1", "-framerate", String(FPS), "-i", source, "-t", String(duration), "-an",
    "-vf", `scale=${W}:${H}:flags=lanczos,fps=${FPS},fade=t=in:st=0:d=.18,fade=t=out:st=${Math.max(0, duration - .20)}:d=.20,format=yuv420p`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "15", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", output,
  ]);
}

async function renderLogo(ffmpeg, source, output, duration) {
  await run(ffmpeg, [
    "-y", "-stream_loop", "-1", "-i", source, "-t", String(duration), "-an",
    "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},format=yuv420p`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", output,
  ]);
}

async function founderAtmosphere(dir, name, variant = 0) {
  const target = path.join(dir, `${name}.rgba`);
  const left = variant % 2 === 0 ? 160 : 120;
  const right = variant % 2 === 0 ? 1110 : 1160;
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>
        <radialGradient id="halo"><stop offset="0" stop-color="#a6f3ff" stop-opacity=".20"/><stop offset="1" stop-color="#7deaff" stop-opacity="0"/></radialGradient>
        <filter id="g"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <ellipse cx="640" cy="650" rx="260" ry="54" fill="url(#halo)"/>
      <ellipse cx="640" cy="642" rx="148" ry="24" fill="none" stroke="#9af3ff" stroke-opacity=".27"/>
      <ellipse cx="640" cy="642" rx="82" ry="13" fill="none" stroke="#d8fbff" stroke-opacity=".18"/>
      <g stroke="#8feeff" stroke-opacity=".28" fill="none">
        <path d="M40 260 Q130 185 ${left} 310 T350 420"/>
        <path d="M34 410 Q120 336 230 390 T390 526"/>
        <path d="M1240 220 Q1160 150 ${right} 290 T920 412"/>
        <path d="M1246 430 Q1160 350 1055 402 T905 530"/>
        <circle cx="126" cy="238" r="10"/><circle cx="232" cy="315" r="7"/><circle cx="338" cy="412" r="9"/>
        <circle cx="1152" cy="235" r="9"/><circle cx="1060" cy="310" r="12"/><circle cx="946" cy="410" r="8"/>
        <line x1="126" y1="238" x2="232" y2="315"/><line x1="232" y1="315" x2="338" y2="412"/>
        <line x1="1152" y1="235" x2="1060" y2="310"/><line x1="1060" y1="310" x2="946" y2="410"/>
      </g>
      <g fill="#d9fbff" filter="url(#g)"><circle cx="232" cy="315" r="3"/><circle cx="1060" cy="310" r="3"/><circle cx="640" cy="642" r="3.5"/></g>
      <g fill="#b9f6ff" opacity=".42"><circle cx="72" cy="155" r="1.5"/><circle cx="318" cy="175" r="1.2"/><circle cx="1205" cy="135" r="1.4"/><circle cx="980" cy="158" r="1.1"/><circle cx="80" cy="520" r="1.4"/><circle cx="1190" cy="540" r="1.2"/></g>
    </svg>`);
  const raw = await sharp(svg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  await fs.writeFile(target, raw.data);
  return { path: target, width: raw.info.width, height: raw.info.height };
}

async function renderFounder(ffmpeg, dir, beat, output, variant) {
  const filename = FOUNDER_FILES[beat.id];
  if (!filename) throw new Error(`FOUNDER_MAPPING_REQUIRED:${beat.id}`);
  const storagePath = `${FOUNDER_DIR}/${filename}`;
  if (!(await exists(storagePath))) throw new Error(`FOUNDER_V7_NOT_READY:${beat.id}`);
  const source = path.join(dir, `${beat.id}.source.mp4`);
  await download(storagePath, source);
  const atmosphere = await founderAtmosphere(dir, beat.id, variant);
  const offset = beat.id === "close-02" ? (AVANTIQO_INVESTOR_FINAL_ACT_PLAN.beats.find((b) => b.id === "close-01")?.duration || 0) : 0;
  const args = ["-y"];
  if (offset > 0) args.push("-ss", String(offset));
  args.push(
    "-i", source,
    "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${atmosphere.width}x${atmosphere.height}`, "-framerate", String(FPS), "-stream_loop", "-1", "-i", atmosphere.path,
    "-t", String(beat.duration), "-an",
    "-filter_complex", `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS}[base];[1:v]format=rgba,colorchannelmixer=aa=0.66[fx];[base][fx]overlay=x='3*sin(t*.31)':y='2*cos(t*.28)':format=auto,vignette=PI/7:0.10,format=yuv420p[out]`,
    "-map", "[out]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "15", "-pix_fmt", "yuv420p", "-r", String(FPS), output,
  );
  await run(ffmpeg, args);
}

async function concat(ffmpeg, clips, output, dir, name) {
  const list = path.join(dir, `${name}.txt`);
  await fs.writeFile(list, clips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
  await run(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "15", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", output]);
}

async function renderUiBeat(ffmpeg, dir, m, beat, keys, output) {
  const available = readyKeys(m, keys);
  if (!available.length) throw new Error(`UI_BEAT_NOT_READY:${beat.id}`);
  const count = beat.duration >= 9 ? Math.min(3, available.length) : beat.duration >= 6 ? Math.min(2, available.length) : 1;
  const chosen = available.slice(0, count);
  const clipDuration = beat.duration / chosen.length;
  const clips = [];
  for (let i = 0; i < chosen.length; i += 1) {
    const primary = slot(m, chosen[i]);
    const primaryPath = path.join(dir, `${beat.id}-${i}-primary.png`);
    await download(primary.normalized_path, primaryPath);
    const buffers = [await fs.readFile(primaryPath)];
    if (chosen.length > 1) {
      const secondary = slot(m, chosen[(i + 1) % chosen.length]);
      const secondaryPath = path.join(dir, `${beat.id}-${i}-secondary.png`);
      await download(secondary.normalized_path, secondaryPath);
      buffers.push(await fs.readFile(secondaryPath));
    }
    const frame = await productFrame(dir, `${beat.id}-${i}`, buffers, i % 2 ? "#d7b970" : "#8eeeff");
    const clip = path.join(dir, `${beat.id}-${i}.mp4`);
    await renderStill(ffmpeg, frame, clip, clipDuration);
    clips.push(clip);
  }
  await concat(ffmpeg, clips, output, dir, `${beat.id}-ui`);
}

async function renderPlan(plan, kind, outputPath) {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");
  const m = await manifest();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `investor-v4-${kind}-`));
  try {
    let logo = null;
    if (kind === "final-act") {
      logo = path.join(dir, "logo.mp4");
      await download(LOGO_PATH, logo);
    }
    const clips = [];
    for (const [index, beat] of plan.beats.entries()) {
      const output = path.join(dir, `${String(index).padStart(2, "0")}-${beat.id}.mp4`);
      const card = kind === "product-proof" ? PRODUCT_CARDS[beat.visual] : FINAL_CARDS[beat.visual];
      if (beat.visual === "FOUNDER") {
        await renderFounder(ffmpeg, dir, beat, output, index);
      } else if (beat.visual === "APPROVED_3D_AVANTIQO_LOGO" || beat.visual === "APPROVED_3D_AVANTIQO_LOGO_FINAL_HOLD") {
        await renderLogo(ffmpeg, logo, output, beat.duration);
      } else if (card) {
        const frame = await titleFrame(dir, beat.id, card);
        await renderStill(ffmpeg, frame, output, beat.duration);
      } else {
        const map = kind === "product-proof" ? PRODUCT_MAP : FINAL_MAP;
        const keys = map[beat.visual];
        if (!keys) throw new Error(`VISUAL_MAPPING_REQUIRED:${beat.visual}`);
        await renderUiBeat(ffmpeg, dir, m, beat, keys, output);
      }
      clips.push(output);
    }
    const finished = path.join(dir, `${kind}-v4.mp4`);
    await concat(ffmpeg, clips, finished, dir, `${kind}-final`);
    const actual = await mediaDuration(ffmpeg, finished);
    if (Math.abs(actual - plan.target_duration_seconds) > TOLERANCE) throw new Error(`${kind.toUpperCase()}_DURATION_INVALID:${actual}`);
    const stored = await upload(outputPath, finished, { segment: kind, ui_treatment: "CRISP_AUTHENTIC_UI_CINEMATIC_GLASS", hologram_treatment: "SPATIAL_ARCS_NODES_NO_CARD" });
    return { success: true, kind, output_path: outputPath, duration_seconds: actual, bytes: stored.bytes, sha256: stored.sha256, signed_url: await signedUrl(outputPath) };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function getAvantiqoInvestorCinematicV4Status() {
  return {
    success: true,
    contract: "AVANTIQO_INVESTOR_CINEMATIC_SPATIAL_V4",
    founder_source: "FOUNDER_V7",
    full_screen_screenshot_montage_allowed: false,
    founder_hologram_card_allowed: false,
    founder_hologram_text_allowed: false,
    founder_hologram_policy: "SPATIAL_ARCS_NODES_PARTICLES_CENTER_CLEAR",
    outputs: {
      product: { path: PRODUCT_OUTPUT, ready: await exists(PRODUCT_OUTPUT) },
      final: { path: FINAL_OUTPUT, ready: await exists(FINAL_OUTPUT) },
    },
  };
}

export async function renderAvantiqoInvestorCinematicV4(scope = "all") {
  const results = [];
  if (scope === "all" || scope === "product") results.push(await renderPlan(AVANTIQO_INVESTOR_PRODUCT_PROOF_PLAN, "product-proof", PRODUCT_OUTPUT));
  if (scope === "all" || scope === "final") results.push(await renderPlan(AVANTIQO_INVESTOR_FINAL_ACT_PLAN, "final-act", FINAL_OUTPUT));
  return { success: true, contract: "AVANTIQO_INVESTOR_CINEMATIC_SPATIAL_V4", results };
}
