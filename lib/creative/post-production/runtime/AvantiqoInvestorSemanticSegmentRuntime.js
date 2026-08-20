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
const UI_ROOT = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/ui`;
const UI_MANIFEST_PATH = `${UI_ROOT}/manifest-v1.json`;
const SEGMENT_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/segments`;
const FOUNDER_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/founder-v6`;
const APPROVED_LOGO_PATH = `${ORGANIZATION_ID}/unassigned/df1cdd49-68e2-4a77-956e-6c9565c0074d-google-veo-6c9upygjkui2.mp4`;
const PRODUCT_OUTPUT_PATH = `${SEGMENT_DIR}/product-proof-final-v1.mp4`;
const FINAL_ACT_OUTPUT_PATH = `${SEGMENT_DIR}/final-act-final-v1.mp4`;

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 24;
const DURATION_TOLERANCE = 0.25;

const PRODUCT_DIRECT = Object.freeze({
  organization_intelligence: ["organization_intelligence"],
  operations_command_center: ["operations_command_center"],
  supply_chain: ["supply_chain"],
  finance: ["finance"],
  general_ledger_or_accounting_settings: ["finance_governance_accounting_settings", "general_ledger"],
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

const PRODUCT_TITLE_CARDS = Object.freeze({
  UNDERSTAND_RECOMMEND_APPROVE_EXECUTE: {
    eyebrow: "AVANTIQO INTELLIGENCE",
    title: "UNDERSTAND. RECOMMEND. APPROVE. EXECUTE.",
    detail: "From operating context to accountable action.",
  },
  NOT_ONE_VERTICAL: {
    eyebrow: "CROSS-INDUSTRY BY DESIGN",
    title: "THE POINT IS NOT ONE VERTICAL.",
    detail: "Enter deeply. Expand through the same operating architecture.",
  },
  ONE_OPERATING_ARCHITECTURE: {
    eyebrow: "DIFFERENT INDUSTRIES. DIFFERENT WORKFLOWS.",
    title: "ONE OPERATING ARCHITECTURE.",
    detail: "A shared system for context, decisions and execution.",
  },
});

const FINAL_DIRECT = Object.freeze({
  SALE_TO_FINANCE_TO_SUPPLY_TO_PEOPLE_FLOW: [
    "general_ledger",
    "supply_chain",
    "payroll_control_center",
    "employee_directory",
    "finance_governance_accounting_settings",
  ],
  MULTI_INTERFACE_ONE_TRUTH: [
    "customer_communications",
    "employee_directory",
    "supply_chain",
    "operations_command_center",
  ],
  INTEGRATIONS: ["integrations_connected_services"],
  GOVERNED_AI_CONTEXT: [
    "organization_intelligence",
    "finance_governance_accounting_settings",
    "approval_control",
    "operations_command_center",
  ],
  AUTHENTIC_WORKING_PRODUCT_PROOF: [
    "autonomous_marketing",
    "operations_command_center",
    "general_ledger",
    "pest_control_operations",
    "healthcare_operations",
  ],
  VERTICAL_ENTRY_HORIZONTAL_EXPANSION: [
    "pest_control_operations",
    "restaurant_operations",
    "finance",
    "employee_directory",
    "supply_chain",
    "integrations_connected_services",
  ],
});

const FINAL_TITLE_CARDS = Object.freeze({
  AVANTIQO_INTELLIGENCE: {
    eyebrow: "SHARED OPERATING CONTEXT",
    title: "AVANTIQO INTELLIGENCE",
    detail: "The business stops looking like fragments.",
  },
});

const FOUNDER_FILES = Object.freeze({
  "integration-01": "founder-mid-integration-synced-approved-v6.mp4",
  "ai-01": "founder-mid-ai-synced-approved-v6.mp4",
  "close-01": "founder-close-synced-approved-v6.mp4",
  "close-02": "founder-close-synced-approved-v6.mp4",
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
      reject(new Error("AVANTIQO_INVESTOR_SEGMENT_RENDER_TIMEOUT"));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const trace = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) {
        reject(new Error(trace.slice(-14000) || `FFMPEG_EXIT_${code}`));
        return;
      }
      resolve(trace);
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
    const child = spawn(ffmpeg, ["-hide_banner", "-i", source], {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1" },
    });
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
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(directory, { search: filename, limit: 10 });
  if (error) return false;
  return (data || []).some((row) => row.name === filename);
}

async function download(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`INVESTOR_SEGMENT_SOURCE_EMPTY:${storagePath}`);
  const bytes = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(localPath, bytes);
  return bytes;
}

async function upload(storagePath, localPath) {
  const bytes = await fs.readFile(localPath);
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4",
    cacheControl: "3600",
    upsert: true,
    metadata: {
      organization_id: ORGANIZATION_ID,
      investor_film: "20260820",
      semantic_sync: "true",
      authentic_ui_only: "true",
    },
  });
  if (error) throw error;
  return {
    path: storagePath,
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

async function signedUrl(storagePath, seconds = 86400) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function readUiManifest() {
  if (!(await storageExists(UI_MANIFEST_PATH))) {
    throw new Error("AVANTIQO_INVESTOR_UI_MANIFEST_NOT_READY");
  }
  const { data, error } = await supabase.storage.from(BUCKET).download(UI_MANIFEST_PATH);
  if (error) throw error;
  if (!data) throw new Error("AVANTIQO_INVESTOR_UI_MANIFEST_EMPTY");
  const manifest = JSON.parse(Buffer.from(await data.arrayBuffer()).toString("utf8"));
  if (manifest?.synthetic_ui_allowed !== false) {
    throw new Error("AVANTIQO_INVESTOR_UI_MANIFEST_POLICY_INVALID");
  }
  return manifest;
}

function manifestSlot(manifest, key) {
  return manifest?.slots?.[key] || null;
}

function chooseAvailableSlots(manifest, candidates = []) {
  return candidates.filter((key) => manifestSlot(manifest, key)?.normalized_path);
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function makeTitleCard(directory, name, card) {
  const target = path.join(directory, `${name}.jpg`);
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
      <defs>
        <radialGradient id="bg" cx="50%" cy="44%" r="80%">
          <stop offset="0" stop-color="#131924"/>
          <stop offset=".48" stop-color="#070a0f"/>
          <stop offset="1" stop-color="#020305"/>
        </radialGradient>
        <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="13" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
      <line x1="460" y1="248" x2="820" y2="248" stroke="#c9ac68" stroke-opacity=".62"/>
      <text x="640" y="222" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700" letter-spacing="2.7" fill="#d4b873">${escapeXml(card.eyebrow)}</text>
      <text x="640" y="348" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="35" font-weight="700" letter-spacing="1.1" fill="#ffffff" filter="url(#glow)">${escapeXml(card.title)}</text>
      <text x="640" y="403" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="17" fill="#aeb3bc">${escapeXml(card.detail)}</text>
    </svg>
  `);
  await sharp(svg).jpeg({ quality: 96, chromaSubsampling: "4:4:4" }).toFile(target);
  return target;
}

async function renderStill(ffmpeg, source, output, duration, variant = 0) {
  const frames = Math.max(1, Math.round(duration * FPS));
  const drift = variant % 2 === 0 ? 0.022 : 0.016;
  const zoom = `1.0+${drift}*(on/${frames})`;
  await run(ffmpeg, [
    "-y",
    "-loop", "1",
    "-framerate", String(FPS),
    "-i", source,
    "-t", String(duration),
    "-an",
    "-vf", [
      `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase`,
      `crop=${WIDTH}:${HEIGHT}`,
      `zoompan=z='${zoom}':d=1:s=${WIDTH}x${HEIGHT}:fps=${FPS}`,
      "eq=contrast=1.018:saturation=.97:brightness=-.004",
      "vignette=PI/12",
      "fade=t=in:st=0:d=0.28",
      `fade=t=out:st=${Math.max(0, duration - 0.28)}:d=0.28`,
      "format=yuv420p",
    ].join(","),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-r", String(FPS),
    "-movflags", "+faststart",
    output,
  ]);
}

async function renderVideo(ffmpeg, source, output, duration) {
  await run(ffmpeg, [
    "-y",
    "-stream_loop", "-1",
    "-i", source,
    "-t", String(duration),
    "-an",
    "-vf", [
      `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase`,
      `crop=${WIDTH}:${HEIGHT}`,
      `fps=${FPS}`,
      "eq=contrast=1.018:saturation=.98:brightness=-.004",
      "vignette=PI/14",
      "format=yuv420p",
    ].join(","),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-r", String(FPS),
    "-movflags", "+faststart",
    output,
  ]);
}

async function renderLogoHold(ffmpeg, logoPath, directory, output, duration) {
  const frame = path.join(directory, "approved-logo-final-frame.jpg");
  await run(ffmpeg, [
    "-y",
    "-sseof", "-0.08",
    "-i", logoPath,
    "-frames:v", "1",
    frame,
  ]);
  await renderStill(ffmpeg, frame, output, duration, 0);
}

async function concatClips(ffmpeg, clips, output, directory) {
  const list = path.join(directory, `${path.basename(output)}.concat.txt`);
  await fs.writeFile(
    list,
    clips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n"),
    "utf8",
  );
  await run(ffmpeg, [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", list,
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-r", String(FPS),
    "-movflags", "+faststart",
    output,
  ]);
}

async function renderUiSequence({ ffmpeg, directory, manifest, beat, slots, output }) {
  const available = chooseAvailableSlots(manifest, slots);
  if (!available.length) {
    throw new Error(`AVANTIQO_INVESTOR_UI_BEAT_NOT_READY:${beat.id}:${slots.join(",")}`);
  }

  const requested = available.slice(0, Math.min(available.length, 5));
  const clipDuration = beat.duration / requested.length;
  const clips = [];

  for (const [index, slot] of requested.entries()) {
    const item = manifestSlot(manifest, slot);
    const rawImage = path.join(directory, `${beat.id}-${index}-${slot}.png`);
    const image = path.join(directory, `${beat.id}-${index}-${slot}.jpg`);
    const clip = path.join(directory, `${beat.id}-${index}-${slot}.mp4`);
    await download(item.normalized_path, rawImage);
    await sharp(rawImage).jpeg({ quality: 96, chromaSubsampling: "4:4:4" }).toFile(image);
    await renderStill(ffmpeg, image, clip, clipDuration, index);
    clips.push(clip);
  }

  await concatClips(ffmpeg, clips, output, directory);
}

async function renderTitleBeat({ ffmpeg, directory, beat, card, output }) {
  const frame = await makeTitleCard(directory, `title-${beat.id}`, card);
  await renderStill(ffmpeg, frame, output, beat.duration, 0);
}

async function renderFounderBeat({ ffmpeg, directory, beat, output }) {
  const filename = FOUNDER_FILES[beat.id];
  if (!filename) throw new Error(`FOUNDER_FILE_MAPPING_REQUIRED:${beat.id}`);
  const storagePath = `${FOUNDER_DIR}/${filename}`;
  if (!(await storageExists(storagePath))) {
    throw new Error(`FOUNDER_LIPSYNC_NOT_READY:${beat.id}`);
  }
  const local = path.join(directory, `${beat.id}-founder.mp4`);
  await download(storagePath, local);

  if (beat.id === "close-02") {
    const offset = AVANTIQO_INVESTOR_FINAL_ACT_PLAN.beats
      .find((candidate) => candidate.id === "close-01")?.duration || 0;
    await run(ffmpeg, [
      "-y",
      "-ss", String(offset),
      "-i", local,
      "-t", String(beat.duration),
      "-an",
      "-vf", `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},fps=${FPS},format=yuv420p`,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      output,
    ]);
    return;
  }

  await renderVideo(ffmpeg, local, output, beat.duration);
}

async function renderProductBeat({ ffmpeg, directory, manifest, beat, output }) {
  const title = PRODUCT_TITLE_CARDS[beat.visual];
  if (title) {
    await renderTitleBeat({ ffmpeg, directory, beat, card: title, output });
    return;
  }
  const slots = PRODUCT_DIRECT[beat.visual];
  if (!slots) throw new Error(`PRODUCT_VISUAL_MAPPING_REQUIRED:${beat.visual}`);
  await renderUiSequence({ ffmpeg, directory, manifest, beat, slots, output });
}

async function renderFinalBeat({ ffmpeg, directory, manifest, beat, output, logoLocal }) {
  if (beat.visual === "FOUNDER") {
    await renderFounderBeat({ ffmpeg, directory, beat, output });
    return;
  }

  if (beat.visual === "APPROVED_3D_AVANTIQO_LOGO" || beat.visual === "APPROVED_3D_AVANTIQO_LOGO_FINAL_HOLD") {
    await renderLogoHold(ffmpeg, logoLocal, directory, output, beat.duration);
    return;
  }

  const title = FINAL_TITLE_CARDS[beat.visual];
  if (title) {
    await renderTitleBeat({ ffmpeg, directory, beat, card: title, output });
    return;
  }

  const slots = FINAL_DIRECT[beat.visual];
  if (!slots) throw new Error(`FINAL_VISUAL_MAPPING_REQUIRED:${beat.visual}`);
  await renderUiSequence({ ffmpeg, directory, manifest, beat, slots, output });
}

async function renderPlan({ plan, kind, outputPath, force = false }) {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");

  if (!force && await storageExists(outputPath)) {
    return {
      success: true,
      reused: true,
      kind,
      output_path: outputPath,
      signed_url: await signedUrl(outputPath),
    };
  }

  const manifest = await readUiManifest();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), `avantiqo-investor-${kind}-`));

  try {
    let logoLocal = null;
    if (kind === "final-act") {
      if (!(await storageExists(APPROVED_LOGO_PATH))) {
        throw new Error("APPROVED_3D_LOGO_NOT_READY");
      }
      logoLocal = path.join(directory, "approved-logo.mp4");
      await download(APPROVED_LOGO_PATH, logoLocal);
    }

    const rendered = [];
    for (const [index, beat] of plan.beats.entries()) {
      const output = path.join(directory, `${String(index).padStart(2, "0")}-${beat.id}.mp4`);
      if (kind === "product-proof") {
        await renderProductBeat({ ffmpeg, directory, manifest, beat, output });
      } else {
        await renderFinalBeat({ ffmpeg, directory, manifest, beat, output, logoLocal });
      }
      rendered.push(output);
    }

    const finished = path.join(directory, `${kind}-finished.mp4`);
    await concatClips(ffmpeg, rendered, finished, directory);

    const actualDuration = await mediaDuration(ffmpeg, finished);
    const expectedDuration = plan.target_duration_seconds;
    const delta = Math.abs(actualDuration - expectedDuration);
    if (delta > DURATION_TOLERANCE) {
      throw new Error(`${kind.toUpperCase().replace(/-/g, "_")}_DURATION_OUT_OF_TOLERANCE:${actualDuration}`);
    }

    const stored = await upload(outputPath, finished);
    return {
      success: true,
      reused: false,
      kind,
      output_path: outputPath,
      signed_url: await signedUrl(outputPath),
      bytes: stored.bytes,
      sha256: stored.sha256,
      expected_duration_seconds: expectedDuration,
      actual_duration_seconds: actualDuration,
      duration_delta_seconds: delta,
      semantic_sync: true,
      source_policy: "AUTHENTIC_USER_SUPPLIED_AVANTIQO_UI_ONLY",
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export async function getAvantiqoInvestorSemanticSegmentStatus() {
  const manifestReady = await storageExists(UI_MANIFEST_PATH);
  const productReady = await storageExists(PRODUCT_OUTPUT_PATH);
  const finalActReady = await storageExists(FINAL_ACT_OUTPUT_PATH);
  return {
    success: true,
    contract: "AVANTIQO_INVESTOR_SEMANTIC_SEGMENTS_V1",
    ui_manifest_ready: manifestReady,
    product_proof_ready: productReady,
    final_act_ready: finalActReady,
    product_proof_path: PRODUCT_OUTPUT_PATH,
    final_act_path: FINAL_ACT_OUTPUT_PATH,
    semantic_sync_required: true,
    synthetic_product_ui_allowed: false,
  };
}

export async function renderAvantiqoInvestorProductProof({ force = false } = {}) {
  return renderPlan({
    plan: AVANTIQO_INVESTOR_PRODUCT_PROOF_PLAN,
    kind: "product-proof",
    outputPath: PRODUCT_OUTPUT_PATH,
    force,
  });
}

export async function renderAvantiqoInvestorFinalAct({ force = false } = {}) {
  return renderPlan({
    plan: AVANTIQO_INVESTOR_FINAL_ACT_PLAN,
    kind: "final-act",
    outputPath: FINAL_ACT_OUTPUT_PATH,
    force,
  });
}

export const AvantiqoInvestorSemanticSegmentRuntime = Object.freeze({
  status: getAvantiqoInvestorSemanticSegmentStatus,
  renderProductProof: renderAvantiqoInvestorProductProof,
  renderFinalAct: renderAvantiqoInvestorFinalAct,
  product_output_path: PRODUCT_OUTPUT_PATH,
  final_act_output_path: FINAL_ACT_OUTPUT_PATH,
});