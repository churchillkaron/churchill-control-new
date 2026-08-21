export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import { AVANTIQO_INVESTOR_PRODUCT_PROOF_PLAN } from "@/lib/creative/post-production/runtime/AvantiqoInvestorProductProofPlan";
import { AVANTIQO_INVESTOR_FINAL_ACT_PLAN } from "@/lib/creative/post-production/runtime/AvantiqoInvestorFinalActPlan";

const TOKEN = "avq-investor-cinematic-v5-20260821";
const BUCKET = "creative-assets";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const ROOT = `${ORG}/avantiqo-investor-film-20260820`;
const UI_MANIFEST = `${ROOT}/ui/manifest-v1.json`;
const SEGMENTS = `${ROOT}/segments`;
const FOUNDER = `${ROOT}/founder-v7`;
const OPENING = `${SEGMENTS}/opening-final-v2.mp4`;
const PRODUCT = `${SEGMENTS}/product-proof-final-v1.mp4`;
const FINAL = `${SEGMENTS}/final-act-final-v1.mp4`;
const LOGO = `${ORG}/unassigned/df1cdd49-68e2-4a77-956e-6c9565c0074d-google-veo-6c9upygjkui2.mp4`;
const W = 1280;
const H = 720;
const FPS = 24;

const PMAP = Object.freeze({
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

const FMAP = Object.freeze({
  SALE_TO_FINANCE_TO_SUPPLY_TO_PEOPLE_FLOW: ["general_ledger", "supply_chain", "payroll_control_center", "employee_directory"],
  MULTI_INTERFACE_ONE_TRUTH: ["customer_communications", "employee_directory", "supply_chain", "operations_command_center"],
  INTEGRATIONS: ["integrations_connected_services"],
  GOVERNED_AI_CONTEXT: ["organization_intelligence", "finance_governance_accounting_settings", "approval_control", "operations_command_center"],
  AUTHENTIC_WORKING_PRODUCT_PROOF: ["autonomous_marketing", "operations_command_center", "general_ledger", "pest_control_operations", "healthcare_operations"],
  VERTICAL_ENTRY_HORIZONTAL_EXPANSION: ["pest_control_operations", "restaurant_operations", "finance", "employee_directory", "supply_chain", "integrations_connected_services"],
});

const PCARDS = Object.freeze({
  UNDERSTAND_RECOMMEND_APPROVE_EXECUTE: ["AVANTIQO INTELLIGENCE", "UNDERSTAND · RECOMMEND · APPROVE · EXECUTE", "Operating context becomes accountable action."],
  NOT_ONE_VERTICAL: ["CROSS-INDUSTRY BY DESIGN", "NOT ONE VERTICAL", "Enter deeply. Expand through one operating architecture."],
  ONE_OPERATING_ARCHITECTURE: ["ONE OPERATING ARCHITECTURE", "DIFFERENT INDUSTRIES · ONE SYSTEM", "Context, decisions and execution stay connected."],
});

const FCARDS = Object.freeze({
  AVANTIQO_INTELLIGENCE: ["SHARED OPERATING CONTEXT", "AVANTIQO INTELLIGENCE", "The business stops looking like fragments."],
});

const FOUNDER_FILES = Object.freeze({
  "integration-01": "founder-mid-integration-synced-approved-v7.mp4",
  "ai-01": "founder-mid-ai-synced-approved-v7.mp4",
  "close-01": "founder-close-synced-approved-v7.mp4",
  "close-02": "founder-close-synced-approved-v7.mp4",
});

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

function run(command, args, timeoutMs = 790000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, OMP_NUM_THREADS: "1" } });
    const stderr = [];
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("INVESTOR_CINEMATIC_V5_TIMEOUT")); }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-14000) || `FFMPEG_EXIT_${code}`));
      else resolve(true);
    });
  });
}

async function exists(storagePath) {
  const dir = path.posix.dirname(storagePath);
  const file = path.posix.basename(storagePath);
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(dir, { search: file, limit: 10 });
  if (error) return false;
  return (data || []).some((row) => row.name === file);
}

async function download(storagePath, localPath) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`V5_SOURCE_EMPTY:${storagePath}`);
  const bytes = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(localPath, bytes);
  return bytes;
}

async function upload(storagePath, localPath, metadata = {}) {
  const bytes = await fs.readFile(localPath);
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4",
    cacheControl: "3600",
    upsert: true,
    metadata: {
      organization_id: ORG,
      investor_film: "20260820",
      visual_pass: "CINEMATIC_SPATIAL_V5",
      screenshot_montage: "false",
      founder_card: "false",
      founder_text_overlay: "false",
      ...metadata,
    },
  });
  if (error) throw error;
  return { bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
}

async function signed(storagePath) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, 86400);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function getManifest() {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(UI_MANIFEST);
  if (error) throw error;
  if (!data) throw new Error("UI_MANIFEST_EMPTY");
  return JSON.parse(Buffer.from(await data.arrayBuffer()).toString("utf8"));
}

function mslot(m, key) { return m?.slots?.[key] || null; }
function available(m, keys) { return keys.filter((key) => mslot(m, key)?.normalized_path); }
function esc(v) { return String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

async function roundImage(buffer, width, height, radius = 26) {
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${radius}" fill="white"/></svg>`);
  return sharp(buffer).resize(width, height, { fit: "cover" }).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

async function makeProductFrame(dir, name, buffers, accent) {
  const target = path.join(dir, `${name}.jpg`);
  const bg = await sharp(buffers[0]).resize(W, H, { fit: "cover" }).blur(32).modulate({ brightness: 0.18, saturation: 0.46 }).jpeg({ quality: 91 }).toBuffer();
  const hero = await roundImage(buffers[0], 930, 523, 28);
  const shell = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><radialGradient id="h"><stop offset="0" stop-color="${accent}" stop-opacity=".15"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="#01040a" fill-opacity=".55"/>
    <ellipse cx="640" cy="380" rx="580" ry="310" fill="url(#h)"/>
    <path d="M150 108 Q150 82 176 82 H1086 Q1112 82 1112 108 V604 Q1112 630 1086 630 H176 Q150 630 150 604 Z" fill="#08111a" fill-opacity=".12" stroke="${accent}" stroke-opacity=".26" stroke-width="1.3"/>
    <line x1="120" y1="656" x2="1160" y2="656" stroke="${accent}" stroke-opacity=".16"/>
  </svg>`);
  const layers = [{ input: shell }, { input: hero, left: 175, top: 104 }];
  if (buffers[1]) {
    const mini = await roundImage(buffers[1], 300, 169, 16);
    layers.push({ input: mini, left: 920, top: 500 });
  }
  await sharp(bg).composite(layers).jpeg({ quality: 97, chromaSubsampling: "4:4:4" }).toFile(target);
  return target;
}

async function makeTitleFrame(dir, name, card) {
  const [eyebrow, title, detail] = card;
  const target = path.join(dir, `${name}.jpg`);
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><radialGradient id="b" cx="50%" cy="45%" r="78%"><stop offset="0" stop-color="#10212b"/><stop offset=".5" stop-color="#05090e"/><stop offset="1" stop-color="#010204"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#b)"/>
    <circle cx="640" cy="260" r="54" fill="none" stroke="#8eeeff" stroke-opacity=".2"/><circle cx="640" cy="260" r="5" fill="#d8fbff"/>
    <line x1="430" y1="330" x2="850" y2="330" stroke="#8eeeff" stroke-opacity=".24"/>
    <text x="640" y="368" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="700" letter-spacing="3" fill="#9eeeff">${esc(eyebrow)}</text>
    <text x="640" y="426" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="700" fill="#fff">${esc(title)}</text>
    <text x="640" y="470" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="16" fill="#b5c0c8">${esc(detail)}</text>
  </svg>`);
  await sharp(svg).jpeg({ quality: 97, chromaSubsampling: "4:4:4" }).toFile(target);
  return target;
}

async function makeAtmosphere(dir, name, variant = 0) {
  const target = path.join(dir, `${name}.rgba`);
  const y = variant % 2 ? 300 : 330;
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><radialGradient id="halo"><stop offset="0" stop-color="#a9f5ff" stop-opacity=".20"/><stop offset="1" stop-color="#7deaff" stop-opacity="0"/></radialGradient><filter id="g"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <ellipse cx="640" cy="650" rx="270" ry="58" fill="url(#halo)"/>
    <ellipse cx="640" cy="642" rx="150" ry="24" fill="none" stroke="#9af3ff" stroke-opacity=".25"/>
    <g stroke="#8feeff" stroke-opacity=".28" fill="none">
      <path d="M20 250 Q120 160 240 ${y} T390 500"/><path d="M1260 220 Q1150 140 1040 ${y} T900 490"/>
      <path d="M40 470 Q150 360 290 430"/><path d="M1240 470 Q1130 360 990 430"/>
      <circle cx="118" cy="230" r="9"/><circle cx="236" cy="318" r="7"/><circle cx="352" cy="438" r="8"/>
      <circle cx="1162" cy="230" r="9"/><circle cx="1044" cy="318" r="7"/><circle cx="928" cy="438" r="8"/>
      <line x1="118" y1="230" x2="236" y2="318"/><line x1="236" y1="318" x2="352" y2="438"/>
      <line x1="1162" y1="230" x2="1044" y2="318"/><line x1="1044" y1="318" x2="928" y2="438"/>
    </g>
    <g fill="#d8fbff" filter="url(#g)"><circle cx="236" cy="318" r="3"/><circle cx="1044" cy="318" r="3"/><circle cx="640" cy="642" r="3"/></g>
  </svg>`);
  const raw = await sharp(svg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  await fs.writeFile(target, raw.data);
  return { path: target, width: raw.info.width, height: raw.info.height };
}

async function renderStill(ffmpeg, source, output, duration) {
  await run(ffmpeg, ["-y", "-loop", "1", "-framerate", String(FPS), "-i", source, "-t", String(duration), "-an", "-vf", `scale=${W}:${H}:flags=lanczos,fps=${FPS},format=yuv420p`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "15", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", output]);
}

async function concat(ffmpeg, clips, output, dir, name) {
  const list = path.join(dir, `${name}.txt`);
  await fs.writeFile(list, clips.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
  await run(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "15", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", output]);
}

async function renderUiBeat(ffmpeg, dir, m, beat, keys, output) {
  const choices = available(m, keys);
  if (!choices.length) throw new Error(`UI_BEAT_NOT_READY:${beat.id}`);
  const count = beat.duration >= 9 ? Math.min(3, choices.length) : beat.duration >= 6 ? Math.min(2, choices.length) : 1;
  const chosen = choices.slice(0, count);
  const clips = [];
  const clipDuration = beat.duration / chosen.length;
  for (let i = 0; i < chosen.length; i += 1) {
    const p = mslot(m, chosen[i]);
    const pLocal = path.join(dir, `${beat.id}-${i}-p.png`);
    await download(p.normalized_path, pLocal);
    const buffers = [await fs.readFile(pLocal)];
    if (chosen.length > 1) {
      const s = mslot(m, chosen[(i + 1) % chosen.length]);
      const sLocal = path.join(dir, `${beat.id}-${i}-s.png`);
      await download(s.normalized_path, sLocal);
      buffers.push(await fs.readFile(sLocal));
    }
    const frame = await makeProductFrame(dir, `${beat.id}-${i}`, buffers, i % 2 ? "#d7b970" : "#8eeeff");
    const clip = path.join(dir, `${beat.id}-${i}.mp4`);
    await renderStill(ffmpeg, frame, clip, clipDuration);
    clips.push(clip);
  }
  await concat(ffmpeg, clips, output, dir, `${beat.id}-join`);
}

async function renderFounder(ffmpeg, dir, beat, output, index) {
  const filename = FOUNDER_FILES[beat.id];
  if (!filename) throw new Error(`FOUNDER_FILE_REQUIRED:${beat.id}`);
  const storagePath = `${FOUNDER}/${filename}`;
  const local = path.join(dir, `${beat.id}-founder.mp4`);
  await download(storagePath, local);
  const fx = await makeAtmosphere(dir, beat.id, index);
  const offset = beat.id === "close-02" ? (AVANTIQO_INVESTOR_FINAL_ACT_PLAN.beats.find((b) => b.id === "close-01")?.duration || 0) : 0;
  const args = ["-y"];
  if (offset > 0) args.push("-ss", String(offset));
  args.push("-i", local, "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${fx.width}x${fx.height}`, "-framerate", String(FPS), "-stream_loop", "-1", "-i", fx.path, "-t", String(beat.duration), "-an", "-filter_complex", `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS}[base];[1:v]format=rgba,colorchannelmixer=aa=0.64[fx];[base][fx]overlay=x='3*sin(t*0.3)':y='2*cos(t*0.27)':format=auto,vignette=PI/7:0.10,format=yuv420p[out]`, "-map", "[out]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "15", "-pix_fmt", "yuv420p", "-r", String(FPS), output);
  await run(ffmpeg, args);
}

async function renderLogo(ffmpeg, local, output, duration) {
  await run(ffmpeg, ["-y", "-stream_loop", "-1", "-i", local, "-t", String(duration), "-an", "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},format=yuv420p`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", output]);
}

async function renderPlan(plan, kind, outputPath) {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");
  const m = await getManifest();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `investor-v5-${kind}-`));
  try {
    let logoLocal = null;
    if (kind === "final-act") {
      logoLocal = path.join(dir, "logo.mp4");
      await download(LOGO, logoLocal);
    }
    const clips = [];
    for (const [index, beat] of plan.beats.entries()) {
      const out = path.join(dir, `${String(index).padStart(2, "0")}-${beat.id}.mp4`);
      const card = kind === "product-proof" ? PCARDS[beat.visual] : FCARDS[beat.visual];
      if (beat.visual === "FOUNDER") await renderFounder(ffmpeg, dir, beat, out, index);
      else if (beat.visual === "APPROVED_3D_AVANTIQO_LOGO" || beat.visual === "APPROVED_3D_AVANTIQO_LOGO_FINAL_HOLD") await renderLogo(ffmpeg, logoLocal, out, beat.duration);
      else if (card) await renderStill(ffmpeg, await makeTitleFrame(dir, beat.id, card), out, beat.duration);
      else {
        const map = kind === "product-proof" ? PMAP : FMAP;
        const keys = map[beat.visual];
        if (!keys) throw new Error(`VISUAL_MAPPING_REQUIRED:${beat.visual}`);
        await renderUiBeat(ffmpeg, dir, m, beat, keys, out);
      }
      clips.push(out);
    }
    const finished = path.join(dir, `${kind}.mp4`);
    await concat(ffmpeg, clips, finished, dir, `${kind}-final`);
    const stored = await upload(outputPath, finished, { segment: kind, product_treatment: "CRISP_GLASS_SCENE", founder_treatment: "SPATIAL_ARCS_NODES_NO_CARD" });
    return { success: true, kind, output_path: outputPath, bytes: stored.bytes, sha256: stored.sha256, signed_url: await signed(outputPath) };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function renderOpeningAtmosphere() {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "investor-v5-opening-"));
  try {
    const source = path.join(dir, "opening.mp4");
    const output = path.join(dir, "opening-v5.mp4");
    await download(OPENING, source);
    const fx = await makeAtmosphere(dir, "opening", 0);
    await run(ffmpeg, ["-y", "-i", source, "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${fx.width}x${fx.height}`, "-framerate", String(FPS), "-stream_loop", "-1", "-i", fx.path, "-t", "48.078", "-an", "-filter_complex", `[0:v]scale=${W}:${H},fps=${FPS}[base];[1:v]format=rgba,colorchannelmixer=aa=0.64[fx];[base][fx]overlay=x='3*sin(t*0.3)':y='2*cos(t*0.27)':enable='between(t,8,18)':format=auto,format=yuv420p[out]`, "-map", "[out]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "15", "-pix_fmt", "yuv420p", "-r", String(FPS), "-movflags", "+faststart", output]);
    const stored = await upload(OPENING, output, { segment: "opening", founder_loop: "false", founder_treatment: "SPATIAL_ARCS_NODES_NO_CARD" });
    return { success: true, kind: "opening", output_path: OPENING, bytes: stored.bytes, sha256: stored.sha256, signed_url: await signed(OPENING) };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = url.searchParams.get("action") || "status";
    const scope = url.searchParams.get("scope") || "all";
    if (action === "status") return json({ success: true, contract: "AVANTIQO_INVESTOR_CINEMATIC_SPATIAL_V5", founder_card: false, founder_text_overlay: false, founder_loop: false, screenshot_montage: false, opening_ready: await exists(OPENING), product_ready: await exists(PRODUCT), final_ready: await exists(FINAL) });
    if (action !== "render") return json({ success: false, error: "Unsupported action" }, 400);
    const results = [];
    if (scope === "all" || scope === "opening") results.push(await renderOpeningAtmosphere());
    if (scope === "all" || scope === "product") results.push(await renderPlan(AVANTIQO_INVESTOR_PRODUCT_PROOF_PLAN, "product-proof", PRODUCT));
    if (scope === "all" || scope === "final") results.push(await renderPlan(AVANTIQO_INVESTOR_FINAL_ACT_PLAN, "final-act", FINAL));
    if (!results.length) return json({ success: false, error: "Unsupported scope" }, 400);
    return json({ success: true, contract: "AVANTIQO_INVESTOR_CINEMATIC_SPATIAL_V5", results });
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
