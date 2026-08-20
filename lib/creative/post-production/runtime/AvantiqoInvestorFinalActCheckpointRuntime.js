import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import { AVANTIQO_INVESTOR_FINAL_ACT_PLAN } from "./AvantiqoInvestorFinalActPlan";

const supabase = getServiceSupabase();
const BUCKET = "creative-assets";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const UI_MANIFEST_PATH = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/ui/manifest-v1.json`;
const SEGMENT_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/segments`;
const CHECKPOINT_DIR = `${SEGMENT_DIR}/final-act-beats-v1`;
const FOUNDER_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/founder-v6`;
const APPROVED_LOGO_PATH = `${ORGANIZATION_ID}/unassigned/df1cdd49-68e2-4a77-956e-6c9565c0074d-google-veo-6c9upygjkui2.mp4`;
const FINAL_ACT_OUTPUT_PATH = `${SEGMENT_DIR}/final-act-final-v1.mp4`;
const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 24;
const TOLERANCE = 0.3;

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

const FOUNDER_FILES = Object.freeze({
  "integration-01": "founder-mid-integration-synced-approved-v6.mp4",
  "ai-01": "founder-mid-ai-synced-approved-v6.mp4",
  "close-01": "founder-close-synced-approved-v6.mp4",
  "close-02": "founder-close-synced-approved-v6.mp4",
});

function run(command, args, timeoutMs = 240000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1" },
    });
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("FINAL_ACT_CHECKPOINT_FFMPEG_TIMEOUT"));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const trace = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) reject(new Error(trace.slice(-12000) || `FFMPEG_EXIT_${code}`));
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
  const { data, error } = await supabase.storage.from(BUCKET).list(directory, {
    search: filename,
    limit: 10,
  });
  if (error) return false;
  return (data || []).some((row) => row.name === filename);
}

async function download(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`FINAL_ACT_CHECKPOINT_SOURCE_EMPTY:${storagePath}`);
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
      checkpointed_render: "true",
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
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function readUiManifest() {
  const { data, error } = await supabase.storage.from(BUCKET).download(UI_MANIFEST_PATH);
  if (error) throw error;
  if (!data) throw new Error("FINAL_ACT_UI_MANIFEST_EMPTY");
  const manifest = JSON.parse(Buffer.from(await data.arrayBuffer()).toString("utf8"));
  if (manifest?.synthetic_ui_allowed !== false) {
    throw new Error("FINAL_ACT_UI_MANIFEST_POLICY_INVALID");
  }
  return manifest;
}

function manifestSlot(manifest, key) {
  return manifest?.slots?.[key] || null;
}

function beatStoragePath(index, beat) {
  return `${CHECKPOINT_DIR}/${String(index).padStart(2, "0")}-${beat.id}.mp4`;
}

async function renderStill(ffmpeg, source, output, duration, zoom = 0.016) {
  const frames = Math.max(1, Math.round(duration * FPS));
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
      `zoompan=z='1.0+${zoom}*(on/${frames})':d=1:s=${WIDTH}x${HEIGHT}:fps=${FPS}`,
      "eq=contrast=1.018:saturation=.97:brightness=-.004",
      "vignette=PI/12",
      "fade=t=in:st=0:d=0.28",
      `fade=t=out:st=${Math.max(0, duration - 0.28)}:d=0.28`,
      "format=yuv420p",
    ].join(","),
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-r", String(FPS),
    "-movflags", "+faststart",
    output,
  ]);
}

async function renderVideo(ffmpeg, source, output, duration, offset = null) {
  const args = ["-y"];
  if (offset !== null) args.push("-ss", String(offset));
  args.push(
    "-stream_loop", "-1",
    "-i", source,
    "-t", String(duration),
    "-an",
    "-vf", `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},fps=${FPS},format=yuv420p`,
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-r", String(FPS),
    "-movflags", "+faststart",
    output,
  );
  await run(ffmpeg, args);
}

async function makeTitleCard(directory) {
  const target = path.join(directory, "avantiqo-intelligence.jpg");
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
      <defs>
        <radialGradient id="bg" cx="50%" cy="44%" r="80%">
          <stop offset="0" stop-color="#131924"/>
          <stop offset=".48" stop-color="#070a0f"/>
          <stop offset="1" stop-color="#020305"/>
        </radialGradient>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
      <line x1="460" y1="248" x2="820" y2="248" stroke="#c9ac68" stroke-opacity=".62"/>
      <text x="640" y="222" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700" letter-spacing="2.7" fill="#d4b873">SHARED OPERATING CONTEXT</text>
      <text x="640" y="348" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="35" font-weight="700" letter-spacing="1.1" fill="#ffffff">AVANTIQO INTELLIGENCE</text>
      <text x="640" y="403" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="17" fill="#aeb3bc">The business stops looking like fragments.</text>
    </svg>
  `);
  await sharp(svg).jpeg({ quality: 96, chromaSubsampling: "4:4:4" }).toFile(target);
  return target;
}

async function renderUiBeat({ ffmpeg, directory, manifest, beat, output }) {
  const candidates = FINAL_DIRECT[beat.visual] || [];
  const slot = candidates.find((key) => manifestSlot(manifest, key)?.normalized_path);
  if (!slot) throw new Error(`FINAL_ACT_UI_BEAT_NOT_READY:${beat.id}:${candidates.join(",")}`);
  const item = manifestSlot(manifest, slot);
  const raw = path.join(directory, `${beat.id}-${slot}.png`);
  const jpeg = path.join(directory, `${beat.id}-${slot}.jpg`);
  await download(item.normalized_path, raw);
  await sharp(raw).jpeg({ quality: 96, chromaSubsampling: "4:4:4" }).toFile(jpeg);
  await renderStill(ffmpeg, jpeg, output, beat.duration, 0.016);
}

async function renderFounderBeat({ ffmpeg, directory, beat, output }) {
  const filename = FOUNDER_FILES[beat.id];
  if (!filename) throw new Error(`FINAL_ACT_FOUNDER_MAPPING_REQUIRED:${beat.id}`);
  const storagePath = `${FOUNDER_DIR}/${filename}`;
  if (!(await storageExists(storagePath))) throw new Error(`FINAL_ACT_FOUNDER_NOT_READY:${beat.id}`);
  const local = path.join(directory, `${beat.id}-founder.mp4`);
  await download(storagePath, local);
  const offset = beat.id === "close-02"
    ? AVANTIQO_INVESTOR_FINAL_ACT_PLAN.beats.find((item) => item.id === "close-01")?.duration || 0
    : null;
  await renderVideo(ffmpeg, local, output, beat.duration, offset);
}

async function renderLogoBeat({ ffmpeg, directory, beat, output }) {
  if (!(await storageExists(APPROVED_LOGO_PATH))) throw new Error("FINAL_ACT_APPROVED_LOGO_NOT_READY");
  const logo = path.join(directory, "approved-logo.mp4");
  const frame = path.join(directory, "approved-logo-frame.jpg");
  await download(APPROVED_LOGO_PATH, logo);
  await run(ffmpeg, ["-y", "-sseof", "-0.08", "-i", logo, "-frames:v", "1", frame]);
  await renderStill(ffmpeg, frame, output, beat.duration, 0.012);
}

async function renderBeatFile({ ffmpeg, directory, manifest, beat, output }) {
  if (beat.visual === "FOUNDER") {
    await renderFounderBeat({ ffmpeg, directory, beat, output });
    return;
  }
  if (beat.visual === "APPROVED_3D_AVANTIQO_LOGO" || beat.visual === "APPROVED_3D_AVANTIQO_LOGO_FINAL_HOLD") {
    await renderLogoBeat({ ffmpeg, directory, beat, output });
    return;
  }
  if (beat.visual === "AVANTIQO_INTELLIGENCE") {
    const card = await makeTitleCard(directory);
    await renderStill(ffmpeg, card, output, beat.duration, 0.012);
    return;
  }
  await renderUiBeat({ ffmpeg, directory, manifest, beat, output });
}

export async function getAvantiqoInvestorFinalActCheckpointStatus() {
  const beats = await Promise.all(
    AVANTIQO_INVESTOR_FINAL_ACT_PLAN.beats.map(async (beat, index) => {
      const storagePath = beatStoragePath(index, beat);
      return { index, id: beat.id, duration: beat.duration, path: storagePath, ready: await storageExists(storagePath) };
    }),
  );
  return {
    success: true,
    contract: "AVANTIQO_INVESTOR_FINAL_ACT_CHECKPOINT_V1",
    ready_count: beats.filter((beat) => beat.ready).length,
    total_count: beats.length,
    all_beats_ready: beats.every((beat) => beat.ready),
    final_act_ready: await storageExists(FINAL_ACT_OUTPUT_PATH),
    final_act_path: FINAL_ACT_OUTPUT_PATH,
    beats,
  };
}

export async function renderAvantiqoInvestorFinalActBeat({ index, force = false } = {}) {
  const beatIndex = Number(index);
  if (!Number.isInteger(beatIndex) || beatIndex < 0 || beatIndex >= AVANTIQO_INVESTOR_FINAL_ACT_PLAN.beats.length) {
    throw new Error(`FINAL_ACT_BEAT_INDEX_INVALID:${index}`);
  }
  const beat = AVANTIQO_INVESTOR_FINAL_ACT_PLAN.beats[beatIndex];
  const storagePath = beatStoragePath(beatIndex, beat);
  if (!force && await storageExists(storagePath)) {
    return { success: true, reused: true, index: beatIndex, id: beat.id, output_path: storagePath };
  }

  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");
  const manifest = await readUiManifest();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), `avantiqo-final-beat-${beatIndex}-`));
  try {
    const output = path.join(directory, `${beat.id}.mp4`);
    await renderBeatFile({ ffmpeg, directory, manifest, beat, output });
    const actual = await mediaDuration(ffmpeg, output);
    if (Math.abs(actual - beat.duration) > TOLERANCE) {
      throw new Error(`FINAL_ACT_BEAT_DURATION_OUT_OF_TOLERANCE:${beat.id}:${actual}`);
    }
    const stored = await upload(storagePath, output);
    return {
      success: true,
      reused: false,
      index: beatIndex,
      id: beat.id,
      expected_duration_seconds: beat.duration,
      actual_duration_seconds: actual,
      output_path: storagePath,
      bytes: stored.bytes,
      sha256: stored.sha256,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export async function finalizeAvantiqoInvestorFinalAct({ force = false } = {}) {
  if (!force && await storageExists(FINAL_ACT_OUTPUT_PATH)) {
    return { success: true, reused: true, output_path: FINAL_ACT_OUTPUT_PATH, signed_url: await signedUrl(FINAL_ACT_OUTPUT_PATH) };
  }
  const status = await getAvantiqoInvestorFinalActCheckpointStatus();
  if (!status.all_beats_ready) {
    return { success: false, finalized: false, error: "FINAL_ACT_CHECKPOINTS_NOT_READY", status };
  }

  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-final-assemble-"));
  try {
    const clips = [];
    for (const item of status.beats) {
      const local = path.join(directory, `${String(item.index).padStart(2, "0")}-${item.id}.mp4`);
      await download(item.path, local);
      clips.push(local);
    }
    const list = path.join(directory, "final-act.concat.txt");
    await fs.writeFile(list, clips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
    const finished = path.join(directory, "final-act-final.mp4");
    await run(ffmpeg, [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", list,
      "-an",
      "-c:v", "copy",
      "-movflags", "+faststart",
      finished,
    ]);
    const actual = await mediaDuration(ffmpeg, finished);
    const expected = AVANTIQO_INVESTOR_FINAL_ACT_PLAN.target_duration_seconds;
    const delta = Math.abs(actual - expected);
    if (delta > TOLERANCE) throw new Error(`FINAL_ACT_DURATION_OUT_OF_TOLERANCE:${actual}`);
    const stored = await upload(FINAL_ACT_OUTPUT_PATH, finished);
    return {
      success: true,
      finalized: true,
      output_path: FINAL_ACT_OUTPUT_PATH,
      signed_url: await signedUrl(FINAL_ACT_OUTPUT_PATH),
      expected_duration_seconds: expected,
      actual_duration_seconds: actual,
      duration_delta_seconds: delta,
      bytes: stored.bytes,
      sha256: stored.sha256,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}
