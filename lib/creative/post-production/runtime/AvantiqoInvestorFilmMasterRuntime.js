import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import { AVANTIQO_INVESTOR_FILM_MASTER_PLAN } from "./AvantiqoInvestorFilmMasterPlan";

const supabase = getServiceSupabase();

const BUCKET = "creative-assets";
const ORGANIZATION_ID = AVANTIQO_INVESTOR_FILM_MASTER_PLAN.organization_id;
const MASTER = AVANTIQO_INVESTOR_FILM_MASTER_PLAN;
const TARGET_DURATION = MASTER.duration_seconds;
const DURATION_TOLERANCE = 0.25;

const SEGMENTS = Object.freeze({
  opening: `${MASTER.segment_output_contract.directory}/${MASTER.segment_output_contract.opening}`,
  product_proof: `${MASTER.segment_output_contract.directory}/${MASTER.segment_output_contract.product_proof}`,
  final_act: `${MASTER.segment_output_contract.directory}/${MASTER.segment_output_contract.final_act}`,
});

const SCORE_PATH = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/audio/avantiqo-investor-score-v1-approved.mp3`;
const OUTPUT_PATH = `${MASTER.final_output.directory}/${MASTER.final_output.filename}`;

const EXPECTED_APPROVED_SHA256 = Object.freeze({
  logo: "df2724aed77176d2d2a8cc41ac7223069953c3da57ce32af18f328ce6e01596a",
  founder_motion: "78b995566a564e7801f0a240a522ae5a02163680006b857bb091572182b121a1",
});

const EXPECTED_SEGMENT_DURATIONS = Object.freeze({
  opening: 48.078,
  product_proof: 96.188,
  final_act: 93.234,
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
      reject(new Error("AVANTIQO_INVESTOR_MASTER_RENDER_TIMEOUT"));
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

function durationFromFfmpeg(value) {
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
      const duration = durationFromFfmpeg(Buffer.concat(stderr).toString("utf8"));
      if (!duration) reject(new Error(`MEDIA_DURATION_UNAVAILABLE:${source}`));
      else resolve(duration);
    });
  });
}

async function storageExists(storagePath) {
  const directory = storagePath.split("/").slice(0, -1).join("/");
  const file = storagePath.split("/").at(-1);
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(directory, { search: file, limit: 10 });
  if (error) return false;
  return (data || []).some((item) => item.name === file);
}

async function download(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`MASTER_SOURCE_EMPTY:${storagePath}`);
  const bytes = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(localPath, bytes);
  return bytes;
}

async function signedUrl(storagePath, seconds = 86400) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function upload(storagePath, localPath) {
  const bytes = await fs.readFile(localPath);
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
  });
  if (error) throw error;
  return {
    path: storagePath,
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

function founderLipSyncPath(window) {
  return `${MASTER.lip_sync_output_contract.directory}/${window.key}-synced-approved-v6.mp4`;
}

function masterPlanContainsRejectedFounder() {
  const serialized = JSON.stringify(MASTER);
  const rejected = String(MASTER.rejected_legacy_founder_asset_id || "").trim();
  if (!rejected) return false;
  const occurrences = serialized.split(rejected).length - 1;
  // One occurrence is expected in the explicit rejected_legacy_founder_asset_id audit field.
  return occurrences > 1;
}

async function quickGateState() {
  const segmentEntries = await Promise.all(
    Object.entries(SEGMENTS).map(async ([key, storagePath]) => ({
      key,
      path: storagePath,
      ready: await storageExists(storagePath),
    })),
  );

  const founderEntries = await Promise.all(
    MASTER.founder_visible_windows.map(async (window) => {
      const storagePath = founderLipSyncPath(window);
      return {
        key: window.key,
        path: storagePath,
        ready: await storageExists(storagePath),
        audio_start: window.audio_start,
        audio_end: window.audio_end,
      };
    }),
  );

  const assets = {
    logo: {
      path: MASTER.approved_logo_path,
      ready: await storageExists(MASTER.approved_logo_path),
    },
    founder_motion: {
      path: MASTER.approved_founder_motion_path,
      ready: await storageExists(MASTER.approved_founder_motion_path),
    },
    narration: {
      path: MASTER.narration_path,
      ready: await storageExists(MASTER.narration_path),
    },
    score: {
      path: SCORE_PATH,
      ready: await storageExists(SCORE_PATH),
    },
  };

  const gates = {
    approved_logo_present: assets.logo.ready,
    locked_cedar_v5_present: assets.narration.ready,
    approved_founder_motion_present: assets.founder_motion.ready,
    final_score_present: assets.score.ready,
    all_visual_segments_present: segmentEntries.every((item) => item.ready),
    all_founder_lipsync_present: founderEntries.every((item) => item.ready),
    rejected_legacy_founder_not_referenced: !masterPlanContainsRejectedFounder(),
    authentic_ui_only_contract: MASTER.synthetic_product_ui_allowed === false,
    semantic_visual_sync_required: MASTER.semantic_visual_sync_required === true,
  };

  return {
    ready: Object.values(gates).every(Boolean),
    gates,
    assets,
    segments: segmentEntries,
    founder_lipsync: founderEntries,
  };
}

async function verifyApprovedChecksums(directory) {
  const targets = [
    {
      key: "logo",
      storagePath: MASTER.approved_logo_path,
      localPath: path.join(directory, "approved-logo.mp4"),
      expected: EXPECTED_APPROVED_SHA256.logo,
    },
    {
      key: "founder_motion",
      storagePath: MASTER.approved_founder_motion_path,
      localPath: path.join(directory, "approved-founder-motion.mp4"),
      expected: EXPECTED_APPROVED_SHA256.founder_motion,
    },
  ];

  const results = [];
  for (const target of targets) {
    const bytes = await download(target.storagePath, target.localPath);
    const actual = crypto.createHash("sha256").update(bytes).digest("hex");
    results.push({
      key: target.key,
      expected_sha256: target.expected,
      actual_sha256: actual,
      valid: actual === target.expected,
    });
  }
  return results;
}

async function verifySegmentDurations(ffmpeg, localSegments) {
  const results = [];
  for (const [key, localPath] of Object.entries(localSegments)) {
    const actual = await mediaDuration(ffmpeg, localPath);
    const expected = EXPECTED_SEGMENT_DURATIONS[key];
    const delta = Math.abs(actual - expected);
    results.push({
      key,
      expected_seconds: expected,
      actual_seconds: actual,
      delta_seconds: delta,
      valid: delta <= DURATION_TOLERANCE,
    });
  }
  return results;
}

async function concatVisualSegments(ffmpeg, localSegments, outputPath, directory) {
  const concatFile = path.join(directory, "visuals.concat.txt");
  const ordered = [
    localSegments.opening,
    localSegments.product_proof,
    localSegments.final_act,
  ];
  await fs.writeFile(
    concatFile,
    ordered.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"),
    "utf8",
  );

  await run(ffmpeg, [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatFile,
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-r", String(MASTER.format.frame_rate),
    "-movflags", "+faststart",
    outputPath,
  ]);
}

async function muxFinalAudio(ffmpeg, visualPath, narrationPath, scorePath, outputPath) {
  const delayMs = Math.round(MASTER.narration_film_start * 1000);
  await run(ffmpeg, [
    "-y",
    "-i", visualPath,
    "-i", narrationPath,
    "-stream_loop", "-1",
    "-i", scorePath,
    "-filter_complex", [
      `[1:a]adelay=${delayMs}|${delayMs},volume=1.0[voice]`,
      `[2:a]atrim=0:${TARGET_DURATION},asetpts=N/SR/TB,volume=0.14,afade=t=in:st=0:d=2.5,afade=t=out:st=${TARGET_DURATION - 4}:d=4[score]`,
      "[voice][score]amix=inputs=2:duration=longest:dropout_transition=0,alimiter=limit=.95[aout]",
    ].join(";"),
    "-map", "0:v:0",
    "-map", "[aout]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-ar", "48000",
    "-t", String(TARGET_DURATION),
    "-movflags", "+faststart",
    outputPath,
  ]);
}

export async function getAvantiqoInvestorFilmMasterStatus() {
  const gateState = await quickGateState();
  return {
    success: true,
    contract: MASTER.contract,
    target_duration_seconds: TARGET_DURATION,
    output_path: OUTPUT_PATH,
    output_ready: await storageExists(OUTPUT_PATH),
    release_ready: gateState.ready,
    release_gates: gateState.gates,
    assets: gateState.assets,
    segments: gateState.segments,
    founder_lipsync: gateState.founder_lipsync,
    score_path: SCORE_PATH,
  };
}

export async function preflightAvantiqoInvestorFilmMaster() {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");

  const gateState = await quickGateState();
  if (!gateState.ready) {
    return {
      success: false,
      ready: false,
      error: "AVANTIQO_INVESTOR_MASTER_RELEASE_GATES_NOT_READY",
      ...gateState,
    };
  }

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-investor-master-preflight-"));
  try {
    const localSegments = {
      opening: path.join(directory, "opening.mp4"),
      product_proof: path.join(directory, "product-proof.mp4"),
      final_act: path.join(directory, "final-act.mp4"),
    };

    await Promise.all([
      download(SEGMENTS.opening, localSegments.opening),
      download(SEGMENTS.product_proof, localSegments.product_proof),
      download(SEGMENTS.final_act, localSegments.final_act),
    ]);

    const [checksumResults, segmentDurations] = await Promise.all([
      verifyApprovedChecksums(directory),
      verifySegmentDurations(ffmpeg, localSegments),
    ]);

    const checksumsValid = checksumResults.every((item) => item.valid);
    const segmentsValid = segmentDurations.every((item) => item.valid);
    const totalDuration = segmentDurations.reduce((sum, item) => sum + item.actual_seconds, 0);
    const totalDurationDelta = Math.abs(totalDuration - TARGET_DURATION);
    const runtimeValid = totalDurationDelta <= DURATION_TOLERANCE;

    return {
      success: checksumsValid && segmentsValid && runtimeValid,
      ready: checksumsValid && segmentsValid && runtimeValid,
      gate_state: gateState,
      approved_asset_checksums: checksumResults,
      segment_durations: segmentDurations,
      total_visual_duration_seconds: totalDuration,
      target_duration_seconds: TARGET_DURATION,
      total_duration_delta_seconds: totalDurationDelta,
      runtime_valid: runtimeValid,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export async function renderAvantiqoInvestorFilmMaster({ force = false } = {}) {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");

  if (!force && await storageExists(OUTPUT_PATH)) {
    return {
      success: true,
      reused: true,
      output_path: OUTPUT_PATH,
      signed_url: await signedUrl(OUTPUT_PATH),
      target_duration_seconds: TARGET_DURATION,
    };
  }

  const preflight = await preflightAvantiqoInvestorFilmMaster();
  if (!preflight.ready) {
    return {
      success: false,
      rendered: false,
      error: "AVANTIQO_INVESTOR_MASTER_PREFLIGHT_FAILED",
      preflight,
    };
  }

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-investor-master-render-"));
  try {
    const localSegments = {
      opening: path.join(directory, "opening.mp4"),
      product_proof: path.join(directory, "product-proof.mp4"),
      final_act: path.join(directory, "final-act.mp4"),
    };
    const narration = path.join(directory, "cedar-v5.mp3");
    const score = path.join(directory, "score.mp3");
    const visuals = path.join(directory, "visual-master.mp4");
    const finished = path.join(directory, "avantiqo-investor-film-v6-master.mp4");

    await Promise.all([
      download(SEGMENTS.opening, localSegments.opening),
      download(SEGMENTS.product_proof, localSegments.product_proof),
      download(SEGMENTS.final_act, localSegments.final_act),
      download(MASTER.narration_path, narration),
      download(SCORE_PATH, score),
    ]);

    await concatVisualSegments(ffmpeg, localSegments, visuals, directory);
    await muxFinalAudio(ffmpeg, visuals, narration, score, finished);

    const finalDuration = await mediaDuration(ffmpeg, finished);
    const durationDelta = Math.abs(finalDuration - TARGET_DURATION);
    if (durationDelta > DURATION_TOLERANCE) {
      throw new Error(`FINAL_RUNTIME_OUT_OF_TOLERANCE:${finalDuration}`);
    }

    const stored = await upload(OUTPUT_PATH, finished);
    return {
      success: true,
      rendered: true,
      reused: false,
      output_path: OUTPUT_PATH,
      signed_url: await signedUrl(OUTPUT_PATH),
      bytes: stored.bytes,
      sha256: stored.sha256,
      target_duration_seconds: TARGET_DURATION,
      actual_duration_seconds: finalDuration,
      duration_delta_seconds: durationDelta,
      preflight,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export const AvantiqoInvestorFilmMasterRuntime = Object.freeze({
  status: getAvantiqoInvestorFilmMasterStatus,
  preflight: preflightAvantiqoInvestorFilmMaster,
  render: renderAvantiqoInvestorFilmMaster,
  output_path: OUTPUT_PATH,
  score_path: SCORE_PATH,
});
