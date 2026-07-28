#!/usr/bin/env node

import crypto from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

import {
  uploadCreativeFileResumable,
} from "../lib/creative/assets/storage/CreativeResumableStorageRuntime.js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const RUNTIME_VERSION = "cole-source-only-master-render-v1";
const EVIDENCE_SOURCE = "LOCAL_ZERO_PROVIDER_SHORTLIST";
const REQUIRED_COMMAND = "MISSION_ACCEPTED";
const TARGET_DURATION_SECONDS = 180;
const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;
const OUTPUT_FRAME_RATE = 30;
const MINIMUM_DISTINCT_SOURCES = 4;
const MAXIMUM_CLIPS_PER_SOURCE = 4;
const EXCLUDED_AI_STATUSES = new Set([
  "REJECTED",
  "RUNNING",
  "FAILED",
  "FAILED_RECONCILIATION_REQUIRED",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name} required`);
  return value;
}

function safe(value, fallback = "media") {
  return text(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function upper(value) {
  return text(value).toUpperCase();
}

function hashJson(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function storageReference(reference) {
  const match = text(reference).match(/^storage:\/\/([^/]+)\/(.+)$/);
  if (!match) throw new Error(`PRIVATE_STORAGE_REFERENCE_REQUIRED:${reference}`);
  return { bucket: match[1], storagePath: match[2] };
}

function storageUri(bucket, storagePath) {
  return `storage://${bucket}/${storagePath}`;
}

function candidateRange(candidate) {
  const range = object(candidate?.metadata?.original_source_range);
  const start = finite(range.start_seconds, -1);
  const end = finite(range.end_seconds, -1);
  const suppliedDuration = finite(range.duration_seconds, -1);
  const duration = end > start ? end - start : suppliedDuration;
  if (start < 0 || duration <= 0) return null;
  return {
    start_seconds: start,
    end_seconds: start + duration,
    duration_seconds: duration,
  };
}

function candidateSourceId(candidate) {
  return text(candidate?.metadata?.source_asset_node_id) ||
    text(candidate?.parent_asset_node_id) ||
    null;
}

function candidateScore(candidate) {
  return finite(
    candidate?.metadata?.local_score ??
      candidate?.metadata?.score ??
      candidate?.intelligence?.quality_score ??
      candidate?.intelligence?.reuse_score,
    0,
  );
}

function candidateStatus(candidate) {
  return upper(candidate?.metadata?.ai_verification_status || "NOT_SELECTED");
}

function candidatePriority(candidate) {
  const status = candidateStatus(candidate);
  if (status === "COMPLETE") return 0;
  if (status === "PENDING_AUTHORIZATION") return 1;
  if (status === "NOT_SELECTED") return 2;
  return 3;
}

function findLogo(nodes) {
  return nodes.find((node) =>
    node.type === "LOGO" &&
    node.status !== "ARCHIVED" &&
    text(node.url),
  ) || nodes.find((node) =>
    node.type === "IMAGE" &&
    node.status !== "ARCHIVED" &&
    text(node.url) &&
    /cole[-_ ]?logo/i.test(
      `${node.name || ""} ${object(node.metadata).original_file_name || ""}`,
    ),
  ) || null;
}

function eligibleCandidates(nodes) {
  return nodes
    .filter((node) => {
      const status = candidateStatus(node);
      return (
        node.type === "MOMENT" &&
        node.status !== "ARCHIVED" &&
        node.metadata?.local_shortlist_candidate === true &&
        node.metadata?.blocked !== true &&
        !EXCLUDED_AI_STATUSES.has(status) &&
        text(node.url) &&
        candidateRange(node)
      );
    })
    .sort((left, right) => {
      const priorityDifference =
        candidatePriority(left) - candidatePriority(right);
      if (priorityDifference !== 0) return priorityDifference;

      const leftRank = finite(left.metadata?.shortlist_rank, 999999);
      const rightRank = finite(right.metadata?.shortlist_rank, 999999);
      if (leftRank !== rightRank) return leftRank - rightRank;

      return candidateScore(right) - candidateScore(left);
    });
}

function unresolvedCandidates(nodes) {
  return nodes.filter((node) =>
    node.type === "MOMENT" &&
    node.status !== "ARCHIVED" &&
    node.metadata?.local_shortlist_candidate === true &&
    ["RUNNING", "FAILED", "FAILED_RECONCILIATION_REQUIRED"].includes(
      candidateStatus(node),
    ),
  );
}

function selectTimeline(candidates) {
  const sourceCounts = new Map();
  const preferred = [];
  const overflow = [];

  for (const candidate of candidates) {
    const sourceId = candidateSourceId(candidate) || candidate.id;
    const count = sourceCounts.get(sourceId) || 0;
    if (count < MAXIMUM_CLIPS_PER_SOURCE) {
      preferred.push(candidate);
      sourceCounts.set(sourceId, count + 1);
    } else {
      overflow.push(candidate);
    }
  }

  const entries = [];
  let cursor = 0;

  for (const candidate of [...preferred, ...overflow]) {
    if (cursor >= TARGET_DURATION_SECONDS - 0.001) break;
    const range = candidateRange(candidate);
    if (!range) continue;
    const duration = Math.min(
      range.duration_seconds,
      TARGET_DURATION_SECONDS - cursor,
    );
    if (duration <= 0) continue;

    entries.push({
      index: entries.length + 1,
      source_asset_node_id: candidateSourceId(candidate),
      source_candidate_node_id: candidate.id,
      source_url: candidate.url,
      source_in_seconds: range.start_seconds,
      source_out_seconds: range.start_seconds + duration,
      timeline_in_seconds: cursor,
      timeline_out_seconds: cursor + duration,
      duration_seconds: duration,
      selection_score: candidateScore(candidate),
      ai_verification_status: candidateStatus(candidate),
      evidence_source: EVIDENCE_SOURCE,
      original_audio_preserved: true,
      exact_lip_sync_required: true,
      human_review_required: true,
      original_source_range: range,
    });
    cursor += duration;
  }

  return {
    entries,
    duration_seconds: Number(cursor.toFixed(6)),
    distinct_source_count: new Set(
      entries.map((entry) => entry.source_asset_node_id).filter(Boolean),
    ).size,
  };
}

async function streamHash(filePath) {
  const hash = crypto.createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

async function runCapture(command, args, timeoutMs = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let timer = null;
    let settled = false;

    const finish = (error, value = null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };

    if (timeoutMs) {
      timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(new Error(`PROCESS_TIMEOUT:${command}`));
      }, timeoutMs);
    }

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(
          Buffer.concat(stderr).toString("utf8") ||
            `PROCESS_EXIT_${code}:${command}`,
        ));
        return;
      }
      finish(null, {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

async function probe(ffprobePath, filePath) {
  const result = await runCapture(ffprobePath, [
    "-v", "error",
    "-show_format",
    "-show_streams",
    "-of", "json",
    filePath,
  ], 10 * 60 * 1000);
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`FFPROBE_INVALID_JSON:${filePath}`);
  }
}

function normalizedProbe(probeResult) {
  const streams = Array.isArray(probeResult?.streams)
    ? probeResult.streams
    : [];
  const video = streams.find((stream) => stream.codec_type === "video") || null;
  const audio = streams.find((stream) => stream.codec_type === "audio") || null;
  const duration = finite(
    probeResult?.format?.duration ?? video?.duration ?? audio?.duration,
    0,
  );
  return {
    duration_seconds: duration,
    width: finite(video?.width, 0),
    height: finite(video?.height, 0),
    video_codec: text(video?.codec_name) || null,
    pixel_format: text(video?.pix_fmt) || null,
    audio_codec: text(audio?.codec_name) || null,
    sample_rate: finite(audio?.sample_rate, 0),
    channels: finite(audio?.channels, 0),
    channel_layout: text(audio?.channel_layout) || null,
    has_video: Boolean(video),
    has_audio: Boolean(audio),
    streams,
  };
}

async function downloadStorageObject({
  supabase,
  reference,
  destination,
  label,
}) {
  const { bucket, storagePath } = storageReference(reference);
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 6 * 60 * 60);
  if (error || !data?.signedUrl) {
    throw new Error(
      `SIGNED_URL_FAILED:${label}:${error?.message || "missing"}`,
    );
  }

  const response = await fetch(data.signedUrl);
  if (!response.ok || !response.body) {
    throw new Error(`SOURCE_DOWNLOAD_FAILED:${label}:${response.status}`);
  }

  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(destination),
  );

  const stat = await fs.stat(destination);
  if (!stat.isFile() || stat.size <= 0) {
    throw new Error(`SOURCE_DOWNLOAD_EMPTY:${label}`);
  }

  return {
    bucket,
    storage_path: storagePath,
    file_path: destination,
    size_bytes: stat.size,
  };
}

function videoFilter(inputIndex, entry) {
  return [
    `[${inputIndex}:v]`,
    `trim=start=${entry.source_in_seconds}:end=${entry.source_out_seconds}`,
    "setpts=PTS-STARTPTS",
    `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase`,
    `crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`,
    `fps=${OUTPUT_FRAME_RATE}`,
    "setsar=1",
    "format=yuv420p",
    `[v${entry.index}]`,
  ].join(",").replace(",[v", "[v");
}

function audioFilter(inputIndex, entry) {
  return [
    `[${inputIndex}:a]`,
    `atrim=start=${entry.source_in_seconds}:end=${entry.source_out_seconds}`,
    "asetpts=PTS-STARTPTS",
    "aformat=sample_rates=48000:channel_layouts=stereo",
    `[a${entry.index}]`,
  ].join(",").replace(",[a", "[a");
}

async function runFfmpeg({
  ffmpegPath,
  args,
  targetDuration,
  timeoutMs,
}) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const errors = [];
    let timer = null;
    let settled = false;
    let lastProgress = -1;

    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };

    timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("MASTER_VIDEO_RENDER_TIMEOUT"));
    }, timeoutMs);

    const lineReader = readline.createInterface({ input: child.stderr });
    lineReader.on("line", (line) => {
      errors.push(line);
      if (errors.length > 300) errors.shift();
      const match = line.match(/^out_time_us=(\d+)$/);
      if (!match) return;
      const seconds = Number(match[1]) / 1_000_000;
      const percentage = Math.max(
        0,
        Math.min(100, Math.floor((seconds / targetDuration) * 100)),
      );
      if (percentage >= lastProgress + 5 || percentage === 100) {
        lastProgress = percentage;
        console.log(`RENDER_PROGRESS=${percentage}%`);
      }
    });

    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      lineReader.close();
      if (code !== 0) {
        finish(new Error(
          errors.filter(Boolean).slice(-80).join("\n") ||
            `MASTER_VIDEO_RENDER_EXIT_${code}`,
        ));
        return;
      }
      finish();
    });
  });
}

function qcResult(technical) {
  const durationPass =
    technical.duration_seconds >= 179.5 &&
    technical.duration_seconds <= 180.5;
  const dimensionsPass =
    technical.width === OUTPUT_WIDTH &&
    technical.height === OUTPUT_HEIGHT;
  const videoPass = technical.has_video && technical.video_codec === "h264";
  const audioPass =
    technical.has_audio &&
    technical.audio_codec === "aac" &&
    technical.sample_rate === 48000 &&
    technical.channels === 2;

  return {
    passed: durationPass && dimensionsPass && videoPass && audioPass,
    duration_pass: durationPass,
    dimensions_pass: dimensionsPass,
    video_pass: videoPass,
    audio_pass: audioPass,
    expected_duration_seconds: TARGET_DURATION_SECONDS,
    expected_width: OUTPUT_WIDTH,
    expected_height: OUTPUT_HEIGHT,
    expected_video_codec: "h264",
    expected_audio_codec: "aac",
    expected_sample_rate: 48000,
    expected_channels: 2,
    technical,
  };
}

async function countRows(supabase, table, organizationId) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  if (error) throw new Error(`${table}_COUNT_FAILED:${error.message}`);
  return count || 0;
}

async function walletState(supabase, organizationId) {
  const { data, error } = await supabase
    .from("organization_wallets")
    .select("available_balance,reserved_balance,currency")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(`WALLET_READ_FAILED:${error.message}`);
  return data || null;
}

async function executionSnapshot(supabase, organizationId) {
  const [usageCount, walletTransactionCount, jobCount, wallet] =
    await Promise.all([
      countRows(supabase, "platform_service_usage", organizationId),
      countRows(supabase, "wallet_transactions", organizationId),
      countRows(supabase, "creative_execution_jobs", organizationId),
      walletState(supabase, organizationId),
    ]);
  return {
    usage_count: usageCount,
    wallet_transaction_count: walletTransactionCount,
    execution_job_count: jobCount,
    wallet,
  };
}

function snapshotsMatch(before, after) {
  return (
    before.usage_count === after.usage_count &&
    before.wallet_transaction_count === after.wallet_transaction_count &&
    before.execution_job_count === after.execution_job_count &&
    finite(before.wallet?.available_balance, 0) ===
      finite(after.wallet?.available_balance, 0) &&
    finite(before.wallet?.reserved_balance, 0) ===
      finite(after.wallet?.reserved_balance, 0)
  );
}

const command = upper(required("COLE_LEY_PRODUCTION_COMMAND"));
if (command !== REQUIRED_COMMAND) {
  throw new Error(`PRODUCTION_COMMAND_REQUIRED:${REQUIRED_COMMAND}`);
}

const organizationId = required("CREATIVE_SMOKE_ORGANIZATION_ID");
const projectId = required("COLE_LEY_PROJECT_ID");
const missionId = required("COLE_LEY_MISSION_ID");
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const ffmpegPath = required("CREATIVE_MEDIA_FFMPEG_PATH");
const ffprobePath = required("CREATIVE_MEDIA_FFPROBE_PATH");
const renderBucket =
  text(process.env.CREATIVE_MEDIA_RENDER_BUCKET) || "creative-renders";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  realtime: { transport: WebSocket },
});

console.log("============================================================");
console.log("COLE LEY SOURCE-ONLY MASTER VIDEO PRODUCTION");
console.log("============================================================");
console.log(`PRODUCTION_COMMAND=${command}`);
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_PROJECT_ID=${projectId}`);
console.log(`CREATIVE_MISSION_ID=${missionId}`);
console.log(`EVIDENCE_SOURCE=${EVIDENCE_SOURCE}`);
console.log("AI_PROVIDER_CALLS=NO");
console.log("VIDEO_PROVIDER_CALLS=NO");
console.log("SOURCE_ONLY_FFMPEG=YES");
console.log("HUMAN_REVIEW_REQUIRED=YES");
console.log("============================================================");

const { data: project, error: projectError } = await supabase
  .from("creative_projects")
  .select("*")
  .eq("id", projectId)
  .eq("organization_id", organizationId)
  .maybeSingle();
if (projectError || !project) {
  throw new Error(
    `PROJECT_READ_FAILED:${projectError?.message || "missing"}`,
  );
}
if (text(project.creative_mission_id) !== missionId) {
  throw new Error("PROJECT_MISSION_SCOPE_MISMATCH");
}

const { data: nodes, error: nodesError } = await supabase
  .from("creative_asset_nodes")
  .select("*")
  .eq("organization_id", organizationId)
  .eq("creative_project_id", projectId)
  .neq("status", "ARCHIVED")
  .order("created_at", { ascending: true });
if (nodesError) {
  throw new Error(`ASSET_NODE_READ_FAILED:${nodesError.message}`);
}

const unresolved = unresolvedCandidates(nodes || []);
if (unresolved.length) {
  throw new Error(
    `LEGACY_VERIFICATION_RECONCILIATION_REQUIRED:${unresolved.map((node) => node.id).join(",")}`,
  );
}

const candidates = eligibleCandidates(nodes || []);
const selection = selectTimeline(candidates);
const logo = findLogo(nodes || []);

if (selection.duration_seconds !== TARGET_DURATION_SECONDS) {
  throw new Error(
    `MASTER_VIDEO_DURATION_NOT_READY:${selection.duration_seconds}`,
  );
}
if (selection.distinct_source_count < MINIMUM_DISTINCT_SOURCES) {
  throw new Error(
    `MASTER_VIDEO_SOURCE_DIVERSITY_NOT_READY:${selection.distinct_source_count}`,
  );
}
if (!logo) throw new Error("MASTER_VIDEO_LOGO_REQUIRED");

console.log(`SELECTED_CLIP_COUNT=${selection.entries.length}`);
console.log(`SELECTED_DURATION_SECONDS=${selection.duration_seconds}`);
console.log(`DISTINCT_ORIGINAL_SOURCE_COUNT=${selection.distinct_source_count}`);
console.log(`LOGO_ASSET_NODE_ID=${logo.id}`);
console.log("MISSION_ACCEPTED=YES");

const timelineIdentity = hashJson({
  runtime: RUNTIME_VERSION,
  organization_id: organizationId,
  creative_project_id: projectId,
  creative_mission_id: missionId,
  evidence_source: EVIDENCE_SOURCE,
  entries: selection.entries.map((entry) => ({
    source_asset_node_id: entry.source_asset_node_id,
    source_candidate_node_id: entry.source_candidate_node_id,
    source_in_seconds: entry.source_in_seconds,
    source_out_seconds: entry.source_out_seconds,
  })),
  logo_asset_node_id: logo.id,
});

let { data: timeline, error: timelineReadError } = await supabase
  .from("creative_asset_nodes")
  .select("*")
  .eq("organization_id", organizationId)
  .eq("creative_project_id", projectId)
  .eq("type", "TIMELINE")
  .eq("metadata->>master_video_timeline_identity", timelineIdentity)
  .neq("status", "ARCHIVED")
  .maybeSingle();
if (timelineReadError) {
  throw new Error(`TIMELINE_READ_FAILED:${timelineReadError.message}`);
}

if (!timeline) {
  const now = new Date().toISOString();
  const timelineId = crypto.randomUUID();
  const { data, error } = await supabase
    .from("creative_asset_nodes")
    .insert({
      id: timelineId,
      organization_id: organizationId,
      creative_project_id: projectId,
      parent_asset_node_id: null,
      type: "TIMELINE",
      status: "REVIEW",
      name: `${project.name || "Cole Ley"} source-only master timeline`,
      description:
        "Three-minute source-only Cole Ley live-performance timeline selected from local technical evidence.",
      url: null,
      storage_path: null,
      lineage: {
        source: "cole_source_only_master_render",
        provider_id: null,
        capability: "creative.video.master.compose.local",
        generation_version: 1,
      },
      technical: {
        mime_type: "application/vnd.avantiqo.edl+json",
        duration_seconds: TARGET_DURATION_SECONDS,
      },
      intelligence: {
        quality_score: null,
        reuse_score: null,
        safety_status: "REVIEW_REQUIRED",
        tags: [
          "source-only",
          "local-editorial-evidence",
          "live-performance",
          "human-review-required",
        ],
      },
      cost: {
        currency: null,
        estimated: 0,
        actual: 0,
        saved_by_reuse: 0,
      },
      reuse: {
        reusable: false,
        reuse_count: 0,
        approved_for_reuse: false,
      },
      review: {
        ai_reviewed: false,
        human_reviewed: false,
        approved: false,
        approved_by: null,
        notes:
          "Human review is mandatory because durable semantic verification evidence was unavailable.",
      },
      metadata: {
        format: "AVANTIQO_EDL_V1",
        edit_decision_list: selection.entries,
        master_video_timeline_identity: timelineIdentity,
        target_duration_seconds: TARGET_DURATION_SECONDS,
        evidence_source: EVIDENCE_SOURCE,
        original_audio_required: true,
        exact_lip_sync_required: true,
        video_generation_provider_allowed: false,
        human_review_required: true,
        creative_mission_id: missionId,
        runtime_version: RUNTIME_VERSION,
      },
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) throw new Error(`TIMELINE_CREATE_FAILED:${error.message}`);
  timeline = data;
  console.log(`TIMELINE_CREATED=${timeline.id}`);
} else {
  console.log(`TIMELINE_REUSED=${timeline.id}`);
}

const renderIdentity = hashJson({
  timeline_id: timeline.id,
  timeline_identity: timelineIdentity,
  runtime: RUNTIME_VERSION,
  width: OUTPUT_WIDTH,
  height: OUTPUT_HEIGHT,
  frame_rate: OUTPUT_FRAME_RATE,
  logo_asset_node_id: logo.id,
});

const { data: existingRender, error: existingRenderError } = await supabase
  .from("creative_asset_nodes")
  .select("*")
  .eq("organization_id", organizationId)
  .eq("creative_project_id", projectId)
  .eq("type", "FINAL_RENDER")
  .eq("metadata->>render_identity", renderIdentity)
  .neq("status", "ARCHIVED")
  .maybeSingle();
if (existingRenderError) {
  throw new Error(`FINAL_RENDER_READ_FAILED:${existingRenderError.message}`);
}
if (existingRender) {
  console.log(`FINAL_RENDER_REUSED=${existingRender.id}`);
  console.log(`FINAL_RENDER_URL=${existingRender.url || ""}`);
  console.log(`FINAL_RENDER_STATUS=${existingRender.status}`);
  console.log("PRODUCTION_STARTED=NO");
  console.log("PRODUCTION_COMPLETED=YES");
  process.exit(0);
}

const beforeSnapshot = await executionSnapshot(supabase, organizationId);
const directory = await fs.mkdtemp(
  path.join(os.tmpdir(), "avantiqo-cole-master-render-"),
);
const sourceMaterial = new Map();

try {
  const selectedSourceIds = [
    ...new Set(
      selection.entries
        .map((entry) => entry.source_asset_node_id)
        .filter(Boolean),
    ),
  ];
  const nodeById = new Map((nodes || []).map((node) => [node.id, node]));

  for (let index = 0; index < selectedSourceIds.length; index += 1) {
    const sourceId = selectedSourceIds[index];
    const source = nodeById.get(sourceId);
    if (!source?.url) throw new Error(`SOURCE_NODE_NOT_FOUND:${sourceId}`);
    const extension = path.extname(
      text(source.name || source.metadata?.original_file_name || ".mov"),
    ) || ".mov";
    const destination = path.join(
      directory,
      `source-${String(index + 1).padStart(2, "0")}${extension}`,
    );
    console.log(`SOURCE_DOWNLOAD_START=${source.name || sourceId}`);
    const downloaded = await downloadStorageObject({
      supabase,
      reference: source.url,
      destination,
      label: source.name || sourceId,
    });
    const technical = normalizedProbe(await probe(ffprobePath, destination));
    if (!technical.has_video) {
      throw new Error(`SOURCE_VIDEO_STREAM_REQUIRED:${sourceId}`);
    }
    if (!technical.has_audio) {
      throw new Error(`SOURCE_AUDIO_STREAM_REQUIRED:${sourceId}`);
    }
    sourceMaterial.set(sourceId, {
      source,
      ...downloaded,
      technical,
    });
    console.log(
      `SOURCE_READY=${source.name || sourceId} SIZE_BYTES=${downloaded.size_bytes} DURATION_SECONDS=${technical.duration_seconds}`,
    );
  }

  const logoPath = path.join(
    directory,
    `logo${path.extname(logo.name || ".png") || ".png"}`,
  );
  await downloadStorageObject({
    supabase,
    reference: logo.url,
    destination: logoPath,
    label: logo.name || logo.id,
  });
  console.log(`LOGO_READY=${logo.name || logo.id}`);

  const uniqueSources = [...sourceMaterial.values()];
  const inputIndexBySourceId = new Map(
    uniqueSources.map((item, index) => [item.source.id, index]),
  );

  for (const entry of selection.entries) {
    const material = sourceMaterial.get(entry.source_asset_node_id);
    if (!material) {
      throw new Error(
        `SELECTED_SOURCE_NOT_MATERIALIZED:${entry.source_asset_node_id}`,
      );
    }
    if (
      entry.source_out_seconds >
      material.technical.duration_seconds + 0.25
    ) {
      throw new Error(
        `SOURCE_RANGE_EXCEEDS_MEDIA:${entry.source_candidate_node_id}:${entry.source_out_seconds}:${material.technical.duration_seconds}`,
      );
    }
  }

  const outputPath = path.join(directory, "cole-ley-master.mp4");
  const args = ["-y", "-hide_banner", "-loglevel", "error"];
  for (const material of uniqueSources) {
    args.push("-i", material.file_path);
  }
  const logoInputIndex = uniqueSources.length;
  args.push("-loop", "1", "-i", logoPath);

  const filters = [];
  for (const entry of selection.entries) {
    const inputIndex = inputIndexBySourceId.get(entry.source_asset_node_id);
    filters.push(videoFilter(inputIndex, entry));
    filters.push(audioFilter(inputIndex, entry));
  }

  filters.push(
    `${selection.entries
      .map((entry) => `[v${entry.index}][a${entry.index}]`)
      .join("")}concat=n=${selection.entries.length}:v=1:a=1[basev][basea]`,
  );
  filters.push(
    `[${logoInputIndex}:v]scale=480:-1,format=rgba,colorchannelmixer=aa=1,setpts=PTS-STARTPTS[logo]`,
  );
  filters.push(
    `[basev][logo]overlay=x=(main_w-overlay_w)/2:y=main_h-overlay_h-80:enable='between(t,172,180)'[outv]`,
  );

  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "[outv]",
    "-map", "[basea]",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-r", String(OUTPUT_FRAME_RATE),
    "-c:a", "aac",
    "-b:a", "256k",
    "-ar", "48000",
    "-ac", "2",
    "-movflags", "+faststart",
    "-t", String(TARGET_DURATION_SECONDS),
    "-progress", "pipe:2",
    "-nostats",
    outputPath,
  );

  console.log("PRODUCTION_STARTED=YES");
  console.log("RENDER_ENGINE=LOCAL_FFMPEG");
  await runFfmpeg({
    ffmpegPath,
    args,
    targetDuration: TARGET_DURATION_SECONDS,
    timeoutMs: 4 * 60 * 60 * 1000,
  });

  const outputStat = await fs.stat(outputPath);
  if (!outputStat.isFile() || outputStat.size <= 0) {
    throw new Error("MASTER_VIDEO_OUTPUT_MISSING");
  }

  const outputTechnical = normalizedProbe(
    await probe(ffprobePath, outputPath),
  );
  const qc = qcResult(outputTechnical);
  console.log(`TECHNICAL_QC=${qc.passed ? "PASS" : "FAIL"}`);
  console.log(`OUTPUT_DURATION_SECONDS=${outputTechnical.duration_seconds}`);
  console.log(`OUTPUT_DIMENSIONS=${outputTechnical.width}x${outputTechnical.height}`);
  console.log(`OUTPUT_VIDEO_CODEC=${outputTechnical.video_codec || ""}`);
  console.log(`OUTPUT_AUDIO_CODEC=${outputTechnical.audio_codec || ""}`);
  if (!qc.passed) {
    throw new Error(`MASTER_VIDEO_TECHNICAL_QC_FAILED:${JSON.stringify(qc)}`);
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "");
  const localOutputPath = path.join(
    process.env.HOME || process.cwd(),
    "Downloads",
    `COLE_LEY_THREE_MINUTE_SHOWREEL_${timestamp}.mp4`,
  );
  await fs.copyFile(outputPath, localOutputPath);

  const renderId = crypto.randomUUID();
  const storagePath = [
    safe(organizationId),
    safe(projectId),
    "renders",
    safe(renderId),
    "cole-ley-three-minute-showreel.mp4",
  ].join("/");

  console.log("RESUMABLE_RENDER_UPLOAD=START");
  await uploadCreativeFileResumable({
    supabaseUrl,
    serviceRoleKey,
    filePath: outputPath,
    bucket: renderBucket,
    storagePath,
    contentType: "video/mp4",
    metadata: {
      organization_id: organizationId,
      creative_project_id: projectId,
      creative_mission_id: missionId,
      render_identity: renderIdentity,
      runtime_version: RUNTIME_VERSION,
      provider_calls: 0,
    },
    cacheControl: "3600",
    upsert: false,
    onProgress({ percentage }) {
      console.log(`UPLOAD_PROGRESS=${percentage}%`);
    },
  });

  const checksum = await streamHash(outputPath);
  const now = new Date().toISOString();
  const finalUrl = storageUri(renderBucket, storagePath);
  const { data: finalRender, error: finalRenderError } = await supabase
    .from("creative_asset_nodes")
    .insert({
      id: renderId,
      organization_id: organizationId,
      creative_project_id: projectId,
      parent_asset_node_id: timeline.id,
      type: "FINAL_RENDER",
      status: "REVIEW",
      name: "Cole Ley — Three-Minute Live Performance Showreel",
      description:
        "Source-only three-minute live-performance master with original audio, Cole Ley branding and mandatory human review.",
      url: finalUrl,
      storage_path: storagePath,
      lineage: {
        source: "cole_source_only_master_render",
        provider_id: null,
        capability: "creative.timeline.render.local",
        generation_version: 1,
      },
      technical: {
        ...outputTechnical,
        mime_type: "video/mp4",
        checksum,
        checksum_sha256: checksum,
        file_size_bytes: outputStat.size,
      },
      intelligence: {
        quality_score: null,
        reuse_score: null,
        safety_status: "REVIEW_REQUIRED",
        tags: [
          "source-only",
          "live-performance",
          "original-audio",
          "cole-ley",
          "human-review-required",
        ],
      },
      cost: {
        currency: null,
        estimated: 0,
        actual: 0,
        saved_by_reuse: 0,
      },
      reuse: {
        reusable: false,
        reuse_count: 0,
        approved_for_reuse: false,
      },
      review: {
        ai_reviewed: false,
        human_reviewed: false,
        approved: false,
        approved_by: null,
        notes: "Technical QC passed. Human editorial review required before release.",
      },
      metadata: {
        render_identity: renderIdentity,
        timeline_asset_node_id: timeline.id,
        creative_mission_id: missionId,
        evidence_source: EVIDENCE_SOURCE,
        selected_clip_count: selection.entries.length,
        distinct_original_source_count: selection.distinct_source_count,
        target_duration_seconds: TARGET_DURATION_SECONDS,
        provider_calls: 0,
        video_generation_provider_used: false,
        source_audio_preserved: true,
        exact_lip_sync_required: true,
        human_review_required: true,
        technical_qc: qc,
        storage_bucket: renderBucket,
        local_output_path: localOutputPath,
        runtime_version: RUNTIME_VERSION,
        created_at: now,
      },
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (finalRenderError) {
    throw new Error(`FINAL_RENDER_CREATE_FAILED:${finalRenderError.message}`);
  }

  const afterSnapshot = await executionSnapshot(supabase, organizationId);
  const executionStateUnchanged = snapshotsMatch(
    beforeSnapshot,
    afterSnapshot,
  );
  if (!executionStateUnchanged) {
    throw new Error(
      `PROVIDER_OR_WALLET_STATE_CHANGED:${JSON.stringify({ beforeSnapshot, afterSnapshot })}`,
    );
  }

  console.log(`FINAL_RENDER_ASSET_NODE_ID=${finalRender.id}`);
  console.log(`FINAL_RENDER_URL=${finalRender.url}`);
  console.log(`FINAL_RENDER_STORAGE_PATH=${storagePath}`);
  console.log(`LOCAL_OUTPUT_PATH=${localOutputPath}`);
  console.log(`OUTPUT_FILE_SIZE_BYTES=${outputStat.size}`);
  console.log(`OUTPUT_CHECKSUM_SHA256=${checksum}`);
  console.log("USAGE_ROW_COUNT_UNCHANGED=PASS");
  console.log("WALLET_TRANSACTION_COUNT_UNCHANGED=PASS");
  console.log("WALLET_BALANCE_UNCHANGED=PASS");
  console.log("EXECUTION_JOB_COUNT_UNCHANGED=PASS");
  console.log("AI_PROVIDER_CALLS=NO");
  console.log("VIDEO_PROVIDER_CALLS=NO");
  console.log("PRODUCTION_COMPLETED=YES");
  console.log("HUMAN_REVIEW_REQUIRED=YES");
} finally {
  await fs.rm(directory, { recursive: true, force: true });
}

console.log("============================================================");
