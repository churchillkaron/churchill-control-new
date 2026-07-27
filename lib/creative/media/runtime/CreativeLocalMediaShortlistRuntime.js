import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import sharp from "sharp";

import {
  getServiceSupabase,
} from "@/lib/shared/supabase/service";
import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  CreativePerformanceVideoIntelligenceRuntime,
} from "@/lib/creative/media/runtime/CreativePerformanceVideoIntelligenceRuntime";
import {
  creativeStorageUri,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  OrganizationServiceRuntime,
} from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import {
  resolveServiceCapabilities,
} from "@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver";
import {
  resolvePrimaryExecutionCapability,
} from "@/lib/platform/service-runtime/services/resolver/CapabilityExecutionResolver";
import {
  resolveProvider,
} from "@/lib/platform/service-runtime/providers/ProviderResolver";
import {
  PricingRuntime,
} from "@/lib/platform/service-runtime/pricing/PricingRuntime";

const supabaseAdmin = getServiceSupabase();
const ANALYSIS_SERVICE_ID = "ai.image.analyze";
const LOCAL_POLICY_VERSION = "creative-local-shortlist-v1";
const PROJECT_POLICY_VERSION = "creative-project-shortlist-v1";

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

function clamp(value, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, finite(value, minimum)));
}

function average(values = [], fallback = 0) {
  const numbers = values
    .map((value) => finite(value))
    .filter((value) => value !== null);
  if (!numbers.length) return fallback;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function safe(value, fallback = "media") {
  return text(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function runProcess(command, args, timeoutMs = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    let timer = null;

    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    };

    if (timeoutMs) {
      timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(new Error("LOCAL_MEDIA_ANALYSIS_TIMEOUT"));
      }, timeoutMs);
    }

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", finish);
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(
          Buffer.concat(stderr).toString("utf8") ||
          `LOCAL_MEDIA_ANALYSIS_EXIT_${code}`,
        ));
        return;
      }
      finish();
    });
  });
}

function parseSilences(log = "") {
  const starts = [...log.matchAll(/silence_start:\s*([0-9.]+)/g)]
    .map((match) => finite(match[1]))
    .filter((value) => value !== null);
  const ends = [...log.matchAll(/silence_end:\s*([0-9.]+)/g)]
    .map((match) => finite(match[1]))
    .filter((value) => value !== null);
  const count = Math.min(starts.length, ends.length);
  const ranges = [];

  for (let index = 0; index < count; index += 1) {
    if (ends[index] <= starts[index]) continue;
    ranges.push({
      start_seconds: starts[index],
      end_seconds: ends[index],
      duration_seconds: ends[index] - starts[index],
    });
  }

  return ranges;
}

function sectionRanges(duration, silences, policy = {}) {
  const minimumSection = finite(
    policy.minimum_section_seconds ?? policy.minimumSectionSeconds,
    8,
  );
  const maximumSection = finite(
    policy.maximum_section_seconds ?? policy.maximumSectionSeconds,
    20,
  );
  const minimumBoundarySilence = finite(
    policy.minimum_boundary_silence_seconds ??
    policy.minimumBoundarySilenceSeconds,
    1.2,
  );
  const points = [0];

  for (const silence of silences) {
    if (silence.duration_seconds < minimumBoundarySilence) continue;
    points.push((silence.start_seconds + silence.end_seconds) / 2);
  }
  points.push(duration);

  const unique = [...new Set(points
    .map((value) => clamp(value, 0, duration))
    .map((value) => Number(value.toFixed(3))))]
    .sort((left, right) => left - right);
  const raw = [];

  for (let index = 0; index < unique.length - 1; index += 1) {
    const start = unique[index];
    const end = unique[index + 1];
    if (end > start) raw.push({ start_seconds: start, end_seconds: end });
  }

  const merged = [];
  for (const range of raw) {
    const length = range.end_seconds - range.start_seconds;
    if (length >= minimumSection || !merged.length) {
      merged.push({ ...range });
      continue;
    }
    merged[merged.length - 1].end_seconds = range.end_seconds;
  }

  const sections = [];
  for (const range of merged) {
    const total = range.end_seconds - range.start_seconds;
    const parts = maximumSection > 0
      ? Math.max(1, Math.ceil(total / maximumSection))
      : 1;
    const partDuration = total / parts;

    for (let index = 0; index < parts; index += 1) {
      const start = range.start_seconds + partDuration * index;
      const end = index === parts - 1
        ? range.end_seconds
        : range.start_seconds + partDuration * (index + 1);
      if (end - start < minimumSection && sections.length) {
        sections[sections.length - 1].end_seconds = end;
        sections[sections.length - 1].duration_seconds =
          end - sections[sections.length - 1].start_seconds;
        continue;
      }
      sections.push({
        index: sections.length,
        start_seconds: start,
        end_seconds: end,
        duration_seconds: end - start,
      });
    }
  }

  if (!sections.length && duration > 0) {
    sections.push({
      index: 0,
      start_seconds: 0,
      end_seconds: duration,
      duration_seconds: duration,
    });
  }

  return sections;
}

function sampleTimes(section, policy = {}) {
  const fractions = Array.isArray(policy.local_sample_fractions)
    ? policy.local_sample_fractions
    : Array.isArray(policy.localSampleFractions)
      ? policy.localSampleFractions
      : [0.2, 0.5, 0.8];

  return [...new Set(fractions
    .map((fraction) => clamp(fraction, 0.05, 0.95))
    .map((fraction) => Number((
      section.start_seconds + section.duration_seconds * fraction
    ).toFixed(3))))];
}

function parseVolume(log = "") {
  const mean = finite(log.match(/mean_volume:\s*(-?[0-9.]+)\s*dB/i)?.[1], -60);
  const maximum = finite(log.match(/max_volume:\s*(-?[0-9.]+)\s*dB/i)?.[1], -60);
  return {
    mean_volume_db: mean,
    max_volume_db: maximum,
  };
}

function brightnessScore(value) {
  const brightness = clamp(value, 0, 1);
  return clamp(100 - Math.abs(brightness - 0.5) * 220);
}

function sharpnessScore(value) {
  return clamp(Math.log1p(Math.max(0, finite(value, 0))) / Math.log(26) * 100);
}

function entropyScore(value) {
  return clamp(finite(value, 0) / 8 * 100);
}

function contrastScore(value) {
  return clamp(finite(value, 0) / 64 * 100);
}

function audioScore(volume = {}) {
  const mean = finite(volume.mean_volume_db, -60);
  const maximum = finite(volume.max_volume_db, -60);
  const meanScore = clamp((mean + 48) / 36 * 100);
  const peakScore = clamp((maximum + 24) / 20 * 100);
  const clippingPenalty = maximum > -0.2 ? 20 : maximum > -1 ? 8 : 0;
  return clamp(meanScore * 0.65 + peakScore * 0.35 - clippingPenalty);
}

function frameDifference(left, right) {
  if (!left || !right || left.length !== right.length || !left.length) return 0;
  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    total += Math.abs(left[index] - right[index]);
  }
  return total / left.length / 255;
}

async function inspectFrame({
  inputPath,
  sampleTime,
  directory,
  ffmpegPath,
  timeoutMs,
  index,
}) {
  const framePath = path.join(
    directory,
    `local-${index}-${String(sampleTime).replace(/\./g, "-")}.jpg`,
  );
  await runProcess(ffmpegPath, [
    "-hide_banner",
    "-loglevel", "error",
    "-ss", String(sampleTime),
    "-i", inputPath,
    "-frames:v", "1",
    "-vf", "scale=w='min(1280,iw)':h=-2",
    "-q:v", "2",
    framePath,
  ], timeoutMs);

  const image = sharp(framePath);
  const stats = await image.stats();
  const grayscale = await image
    .clone()
    .resize(64, 36, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer();
  const channels = stats.channels || [];
  const brightness = average(channels.slice(0, 3).map((channel) => channel.mean), 0) / 255;
  const contrast = average(channels.slice(0, 3).map((channel) => channel.stdev), 0);

  return {
    time_seconds: sampleTime,
    brightness,
    contrast,
    entropy: finite(stats.entropy, 0),
    sharpness: finite(stats.sharpness, 0),
    is_near_black: brightness < 0.06,
    is_overexposed: brightness > 0.94,
    grayscale,
  };
}

async function inspectVolume({
  inputPath,
  section,
  ffmpegPath,
  timeoutMs,
}) {
  const { stderr } = await runProcess(ffmpegPath, [
    "-hide_banner",
    "-nostats",
    "-ss", String(section.start_seconds),
    "-i", inputPath,
    "-t", String(section.duration_seconds),
    "-vn",
    "-af", "volumedetect",
    "-f", "null",
    "-",
  ], timeoutMs);
  return parseVolume(stderr);
}

async function inspectSection({
  parent,
  section,
  inputPath,
  directory,
  ffmpegPath,
  timeoutMs,
  policy,
}) {
  const frames = [];
  const times = sampleTimes(section, policy);
  for (let index = 0; index < times.length; index += 1) {
    frames.push(await inspectFrame({
      inputPath,
      sampleTime: times[index],
      directory,
      ffmpegPath,
      timeoutMs,
      index: `${section.index}-${index}`,
    }));
  }

  const volume = await inspectVolume({
    inputPath,
    section,
    ffmpegPath,
    timeoutMs,
  });
  const frameDifferences = [];
  for (let index = 1; index < frames.length; index += 1) {
    frameDifferences.push(frameDifference(
      frames[index - 1].grayscale,
      frames[index].grayscale,
    ));
  }

  const brightness = average(frames.map((frame) => frame.brightness), 0);
  const contrast = average(frames.map((frame) => frame.contrast), 0);
  const entropy = average(frames.map((frame) => frame.entropy), 0);
  const sharpness = average(frames.map((frame) => frame.sharpness), 0);
  const motion = clamp(average(frameDifferences, 0) / 0.18 * 100);
  const blackRatio = frames.length
    ? frames.filter((frame) => frame.is_near_black).length / frames.length
    : 1;
  const overexposedRatio = frames.length
    ? frames.filter((frame) => frame.is_overexposed).length / frames.length
    : 1;
  const durationScore = clamp(
    section.duration_seconds < 4
      ? section.duration_seconds / 4 * 100
      : section.duration_seconds > 30
        ? 100 - (section.duration_seconds - 30) * 2
        : 100,
  );
  const signals = {
    exposure: brightnessScore(brightness),
    contrast: contrastScore(contrast),
    entropy: entropyScore(entropy),
    sharpness: sharpnessScore(sharpness),
    motion,
    audio: audioScore(volume),
    duration: durationScore,
    black_penalty: blackRatio * 100,
    overexposure_penalty: overexposedRatio * 100,
  };
  const score = clamp(
    signals.exposure * 0.14 +
    signals.contrast * 0.12 +
    signals.entropy * 0.12 +
    signals.sharpness * 0.2 +
    signals.motion * 0.12 +
    signals.audio * 0.2 +
    signals.duration * 0.1 -
    signals.black_penalty * 0.45 -
    signals.overexposure_penalty * 0.25,
  );

  return {
    section,
    score,
    signals,
    local_evidence: {
      source_asset_node_id: parent.id,
      source_checksum:
        parent.technical?.checksum_sha256 ||
        parent.technical?.checksum ||
        null,
      sample_times_seconds: times,
      frame_evidence: frames.map((frame) => ({
        time_seconds: frame.time_seconds,
        brightness: frame.brightness,
        contrast: frame.contrast,
        entropy: frame.entropy,
        sharpness: frame.sharpness,
        is_near_black: frame.is_near_black,
        is_overexposed: frame.is_overexposed,
      })),
      mean_frame_difference: average(frameDifferences, 0),
      audio: volume,
      analysed_at: new Date().toISOString(),
    },
  };
}

function sourcePlanIdentity(parent, policy = {}) {
  return hash({
    version: text(policy.version) || LOCAL_POLICY_VERSION,
    source_asset_node_id: parent.id,
    source_checksum:
      parent.technical?.checksum_sha256 || parent.technical?.checksum || null,
    duration_seconds: parent.technical?.duration_seconds || null,
    minimum_section_seconds:
      policy.minimum_section_seconds ?? policy.minimumSectionSeconds ?? 8,
    maximum_section_seconds:
      policy.maximum_section_seconds ?? policy.maximumSectionSeconds ?? 20,
    minimum_boundary_silence_seconds:
      policy.minimum_boundary_silence_seconds ??
      policy.minimumBoundarySilenceSeconds ??
      1.2,
    silence_noise_db:
      policy.silence_noise_db ?? policy.silenceNoiseDb ?? -32,
    silence_duration_seconds:
      policy.silence_duration_seconds ?? policy.silenceDurationSeconds ?? 1.2,
    local_sample_fractions:
      policy.local_sample_fractions || policy.localSampleFractions || [0.2, 0.5, 0.8],
  });
}

function candidateIdentity(planIdentity, section) {
  return hash({
    plan_identity: planIdentity,
    start_seconds: Number(section.start_seconds.toFixed(3)),
    end_seconds: Number(section.end_seconds.toFixed(3)),
  });
}

async function archiveExistingSourcePlan(nodes, planIdentity) {
  for (const node of nodes) {
    if (
      node.metadata?.local_shortlist_plan_identity === planIdentity &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED
    ) {
      await AssetGraphRepository.update(node.id, {
        status: CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
        metadata: {
          ...object(node.metadata),
          archived_by_local_shortlist_refresh: true,
          archived_at: new Date().toISOString(),
        },
      });
    }
  }
}

function candidateSummary(node) {
  return {
    id: node.id,
    source_asset_node_id: node.metadata?.source_asset_node_id || null,
    original_source_range: node.metadata?.original_source_range || null,
    local_score: finite(node.metadata?.local_score, 0),
    local_score_signals: node.metadata?.local_score_signals || {},
    selected_for_ai_verification:
      node.metadata?.selected_for_ai_verification === true,
    shortlist_rank: finite(node.metadata?.shortlist_rank),
    ai_verification_status:
      node.metadata?.ai_verification_status || "NOT_SELECTED",
  };
}

async function uploadExcerpt({
  organizationId,
  parent,
  candidate,
  inputPath,
  directory,
  ffmpegPath,
  timeoutMs,
  policy,
}) {
  const range = candidate.metadata?.original_source_range || {};
  const duration = finite(range.duration_seconds);
  const start = finite(range.start_seconds);
  if (start === null || !duration || duration <= 0) {
    throw new Error("LOCAL_SHORTLIST_RANGE_INVALID");
  }

  const outputPath = path.join(
    directory,
    `excerpt-${safe(candidate.id)}.mp4`,
  );
  await runProcess(ffmpegPath, [
    "-hide_banner",
    "-loglevel", "error",
    "-ss", String(start),
    "-i", inputPath,
    "-t", String(duration),
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-c:v", text(policy.video_codec || policy.videoCodec) || "libx264",
    "-preset", text(policy.video_preset || policy.videoPreset) || "medium",
    "-crf", String(finite(policy.video_crf ?? policy.videoCrf, 18)),
    "-c:a", text(policy.audio_codec || policy.audioCodec) || "aac",
    "-b:a", text(policy.audio_bitrate || policy.audioBitrate) || "192k",
    "-movflags", "+faststart",
    outputPath,
  ], timeoutMs);

  const bucket = text(process.env.CREATIVE_MEDIA_DERIVATIVE_BUCKET);
  if (!bucket) throw new Error("DERIVATIVE_STORAGE_BUCKET_REQUIRED");
  const buffer = await fs.readFile(outputPath);
  const storagePath = [
    safe(organizationId),
    "local-shortlist-excerpts",
    safe(parent.id),
    `${crypto.randomUUID()}.mp4`,
  ].join("/");
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, buffer, {
      contentType: "video/mp4",
      upsert: false,
      cacheControl: "3600",
    });
  if (error) throw error;

  const excerpt = createCreativeAssetNode({
    organization_id: organizationId,
    creative_project_id: parent.creative_project_id,
    creative_asset_id: parent.creative_asset_id,
    parent_asset_node_id: parent.id,
    type: CREATIVE_ASSET_NODE_TYPES.VIDEO,
    status: CREATIVE_ASSET_NODE_STATUS.DERIVED,
    name: `${parent.name || "Source video"} shortlist excerpt`,
    description: "Locally shortlisted high-quality source excerpt pending bounded AI verification.",
    url: creativeStorageUri(bucket, storagePath),
    storage_path: storagePath,
    lineage: {
      source: "local_media_shortlist_excerpt",
      provider_id: null,
      capability: "creative.media.local.shortlist",
      generation_version: 1,
    },
    technical: {
      mime_type: "video/mp4",
      duration_seconds: duration,
      media_kind: "video",
      file_size_bytes: buffer.length,
      source_width: parent.technical?.width || null,
      source_height: parent.technical?.height || null,
    },
    intelligence: {
      quality_score: finite(candidate.metadata?.local_score, 0),
      reuse_score: finite(candidate.metadata?.local_score, 0),
      safety_status: "AI_VERIFICATION_REQUIRED",
      tags: ["local-shortlist", "source-audio-preserved"],
    },
    review: {
      ai_reviewed: false,
      human_reviewed: false,
      approved: false,
      notes: "Bounded AI verification pending.",
    },
    metadata: {
      local_shortlist_candidate_id: candidate.id,
      project_shortlist_identity:
        candidate.metadata?.project_shortlist_identity || null,
      original_master_source_node_id: parent.id,
      original_master_source_range: range,
      original_audio_required: true,
      exact_lip_sync_required: true,
      analysis_excerpt: true,
      created_at: new Date().toISOString(),
    },
  });
  return AssetGraphRepository.create(excerpt);
}

async function estimatePaidAnalysis({
  organizationId,
  callCount,
  country = null,
  currency = null,
  providerPolicy = {},
}) {
  const organizationService = await OrganizationServiceRuntime.get({
    organization_id: organizationId,
    service_id: ANALYSIS_SERVICE_ID,
  });
  if (!organizationService) {
    return {
      ready: false,
      blocking_reason: `${ANALYSIS_SERVICE_ID} is not enabled for organization`,
      call_count: callCount,
    };
  }

  const capabilities = resolveServiceCapabilities(ANALYSIS_SERVICE_ID);
  const capability = resolvePrimaryExecutionCapability(
    capabilities?.capabilities || [],
  );
  if (!capability) {
    return {
      ready: false,
      blocking_reason: `No execution capability mapped for ${ANALYSIS_SERVICE_ID}`,
      call_count: callCount,
    };
  }

  const selected = await resolveProvider({
    organization_id: organizationId,
    capability,
    country,
    currency,
    policy: {
      ...object(organizationService.provider_policy),
      ...object(providerPolicy),
    },
  });
  const pricing = await PricingRuntime.resolve({
    provider: selected.provider,
    capability,
    model: selected.model,
    country,
    currency,
    usage: { quantity: 1 },
  });
  const unitPrice = finite(pricing.customer_price, 0);

  return {
    ready: true,
    service_id: ANALYSIS_SERVICE_ID,
    capability,
    provider: selected.provider,
    model: selected.model || null,
    credential_id: selected.credential_id || null,
    pricing_id: pricing.pricing_id || null,
    currency: pricing.currency,
    unit: pricing.unit || "request",
    unit_customer_price: unitPrice,
    call_count: callCount,
    estimated_customer_price: Number((unitPrice * callCount).toFixed(6)),
    selection_evidence: selected.selection_evidence || null,
  };
}

function rangesSeparated(left, right, minimumDistance) {
  if (
    text(left.metadata?.source_asset_node_id) !==
    text(right.metadata?.source_asset_node_id)
  ) return true;
  const leftRange = left.metadata?.original_source_range || {};
  const rightRange = right.metadata?.original_source_range || {};
  const leftMid = (finite(leftRange.start_seconds, 0) + finite(leftRange.end_seconds, 0)) / 2;
  const rightMid = (finite(rightRange.start_seconds, 0) + finite(rightRange.end_seconds, 0)) / 2;
  return Math.abs(leftMid - rightMid) >= minimumDistance;
}

function selectDiverseCandidates(candidates, policy = {}) {
  const sourceIds = [...new Set(candidates
    .map((candidate) => text(candidate.metadata?.source_asset_node_id))
    .filter(Boolean))];
  const configuredMaximum = Math.max(1, finite(
    policy.maximum_candidates ?? policy.maximumCandidates,
    14,
  ));
  const maximumCandidates = Math.max(
    Math.min(sourceIds.length, candidates.length),
    Math.min(configuredMaximum, candidates.length),
  );
  const minimumPerSource = Math.max(0, finite(
    policy.minimum_per_source ?? policy.minimumPerSource,
    1,
  ));
  const maximumPerSource = Math.max(minimumPerSource || 1, finite(
    policy.maximum_per_source ?? policy.maximumPerSource,
    3,
  ));
  const minimumDistance = Math.max(0, finite(
    policy.minimum_temporal_distance_seconds ??
    policy.minimumTemporalDistanceSeconds,
    10,
  ));
  const sorted = [...candidates].sort((left, right) =>
    finite(right.metadata?.local_score, 0) -
    finite(left.metadata?.local_score, 0),
  );
  const selected = [];
  const perSource = new Map();

  for (const sourceId of sourceIds) {
    for (let count = 0; count < minimumPerSource; count += 1) {
      const candidate = sorted.find((item) =>
        text(item.metadata?.source_asset_node_id) === sourceId &&
        !selected.some((chosen) => chosen.id === item.id) &&
        selected.every((chosen) => rangesSeparated(chosen, item, minimumDistance)),
      );
      if (!candidate || selected.length >= maximumCandidates) break;
      selected.push(candidate);
      perSource.set(sourceId, (perSource.get(sourceId) || 0) + 1);
    }
  }

  for (const candidate of sorted) {
    if (selected.length >= maximumCandidates) break;
    if (selected.some((chosen) => chosen.id === candidate.id)) continue;
    const sourceId = text(candidate.metadata?.source_asset_node_id);
    if ((perSource.get(sourceId) || 0) >= maximumPerSource) continue;
    if (!selected.every((chosen) => rangesSeparated(chosen, candidate, minimumDistance))) {
      continue;
    }
    selected.push(candidate);
    perSource.set(sourceId, (perSource.get(sourceId) || 0) + 1);
  }

  if (selected.length < maximumCandidates) {
    for (const candidate of sorted) {
      if (selected.length >= maximumCandidates) break;
      if (selected.some((chosen) => chosen.id === candidate.id)) continue;
      const sourceId = text(candidate.metadata?.source_asset_node_id);
      if ((perSource.get(sourceId) || 0) >= maximumPerSource) continue;
      selected.push(candidate);
      perSource.set(sourceId, (perSource.get(sourceId) || 0) + 1);
    }
  }

  return selected;
}

function explicitAuthorizationMatches({ authorization, plan }) {
  const approved = authorization?.approved === true;
  const identityMatches =
    text(authorization?.project_shortlist_identity) ===
    text(plan.project_shortlist_identity);
  const maximumCalls = finite(authorization?.maximum_ai_calls, -1);
  const maximumPrice = finite(
    authorization?.maximum_customer_price,
    -1,
  );
  const currencyMatches =
    text(authorization?.currency).toUpperCase() ===
    text(plan.cost_estimate?.currency).toUpperCase();

  return (
    approved &&
    identityMatches &&
    maximumCalls >= plan.estimated_ai_calls &&
    maximumPrice >= plan.cost_estimate.estimated_customer_price &&
    currencyMatches
  );
}

export const CreativeLocalMediaShortlistRuntime = {
  async analyzeSource({
    organization_id,
    parent_asset_node_id,
    policy = {},
    force = false,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!parent_asset_node_id) throw new Error("parent_asset_node_id required");

    const parent = await AssetGraphRepository.getById(parent_asset_node_id);
    if (!parent || String(parent.organization_id) !== String(organization_id)) {
      throw new Error("LOCAL_SHORTLIST_PARENT_NOT_FOUND");
    }
    if (parent.type !== CREATIVE_ASSET_NODE_TYPES.VIDEO) {
      throw new Error("LOCAL_SHORTLIST_VIDEO_REQUIRED");
    }
    if (!parent.url) throw new Error("LOCAL_SHORTLIST_SOURCE_URL_REQUIRED");
    if (!parent.creative_project_id) {
      throw new Error("LOCAL_SHORTLIST_PROJECT_REQUIRED");
    }

    const duration = finite(parent.technical?.duration_seconds);
    if (!duration || duration <= 0) {
      throw new Error("LOCAL_SHORTLIST_DURATION_REQUIRED");
    }
    const planIdentity = sourcePlanIdentity(parent, policy);
    const projectNodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: parent.creative_project_id,
    });
    const existingReport = projectNodes.find((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
      node.metadata?.local_shortlist_plan_identity === planIdentity &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
    );
    const existingCandidates = projectNodes.filter((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
      node.metadata?.local_shortlist_plan_identity === planIdentity &&
      node.metadata?.local_shortlist_candidate === true &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
    );
    if (!force && existingReport && existingCandidates.length) {
      return {
        reused: true,
        source_asset_node_id: parent.id,
        plan_identity: planIdentity,
        quality_report: existingReport,
        candidates: existingCandidates,
      };
    }
    if (force) await archiveExistingSourcePlan(projectNodes, planIdentity);

    const ffmpegPath =
      text(policy.ffmpeg_path || policy.ffmpegPath) ||
      text(process.env.CREATIVE_MEDIA_FFMPEG_PATH) ||
      null;
    if (!ffmpegPath) throw new Error("FFMPEG_NOT_CONFIGURED");
    const timeoutMs = finite(
      policy.timeout_ms ?? policy.timeoutMs ??
      process.env.CREATIVE_MEDIA_TEMPORAL_TIMEOUT_MS,
      60 * 60 * 1000,
    );
    const materialized = await materializeMedia({
      url: parent.url,
      file_name: parent.name || null,
      mime_type: parent.technical?.mime_type || null,
      organization_id,
      policy,
    });
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "avantiqo-local-shortlist-"),
    );

    try {
      const silenceNoise = finite(
        policy.silence_noise_db ?? policy.silenceNoiseDb,
        -32,
      );
      const silenceDuration = finite(
        policy.silence_duration_seconds ?? policy.silenceDurationSeconds,
        1.2,
      );
      const detected = await runProcess(ffmpegPath, [
        "-hide_banner",
        "-nostats",
        "-i", materialized.file_path,
        "-af", `silencedetect=noise=${silenceNoise}dB:d=${silenceDuration}`,
        "-f", "null",
        "-",
      ], timeoutMs);
      const silences = parseSilences(detected.stderr);
      const sections = sectionRanges(duration, silences, policy);
      const evidence = [];

      for (const section of sections) {
        evidence.push(await inspectSection({
          parent,
          section,
          inputPath: materialized.file_path,
          directory,
          ffmpegPath,
          timeoutMs,
          policy,
        }));
      }

      const candidates = [];
      for (const item of evidence) {
        const identity = candidateIdentity(planIdentity, item.section);
        const candidate = createCreativeAssetNode({
          organization_id,
          creative_project_id: parent.creative_project_id,
          creative_asset_id: parent.creative_asset_id,
          parent_asset_node_id: parent.id,
          type: CREATIVE_ASSET_NODE_TYPES.MOMENT,
          status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
          name: `${parent.name || "Source video"} local candidate ${item.section.index + 1}`,
          description: "Locally scored full-timeline candidate pending bounded AI verification.",
          url: parent.url,
          storage_path: parent.storage_path || null,
          lineage: {
            source: "local_media_shortlist",
            provider_id: null,
            capability: "creative.media.local.score",
            generation_version: 1,
          },
          technical: {
            ...object(parent.technical),
            duration_seconds: item.section.duration_seconds,
          },
          intelligence: {
            quality_score: item.score,
            reuse_score: item.score,
            safety_status: "AI_VERIFICATION_REQUIRED",
            tags: ["local-shortlist-candidate", "full-timeline-covered"],
          },
          review: {
            ai_reviewed: false,
            human_reviewed: false,
            approved: false,
            notes: "Local technical scoring only; semantic AI verification pending.",
          },
          metadata: {
            local_shortlist_candidate: true,
            local_candidate_identity: identity,
            local_shortlist_plan_identity: planIdentity,
            local_shortlist_policy_version:
              text(policy.version) || LOCAL_POLICY_VERSION,
            source_asset_node_id: parent.id,
            original_source_range: item.section,
            local_score: item.score,
            local_score_signals: item.signals,
            local_evidence: item.local_evidence,
            performance_verified: false,
            selected_for_ai_verification: false,
            ai_verification_status: "NOT_SELECTED",
            blocked: false,
            created_at: new Date().toISOString(),
          },
        });
        candidates.push(await AssetGraphRepository.create(candidate));
      }

      const qualityReport = createCreativeAssetNode({
        organization_id,
        creative_project_id: parent.creative_project_id,
        creative_asset_id: parent.creative_asset_id,
        parent_asset_node_id: parent.id,
        type: CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT,
        status: CREATIVE_ASSET_NODE_STATUS.GENERATED,
        name: `${parent.name || "Source video"} local shortlist report`,
        description: "Zero-provider full-timeline technical scoring report.",
        lineage: {
          source: "local_media_shortlist",
          provider_id: null,
          capability: "creative.media.local.score",
          generation_version: 1,
        },
        technical: {
          duration_seconds: duration,
          source_checksum:
            parent.technical?.checksum_sha256 ||
            parent.technical?.checksum ||
            null,
        },
        intelligence: {
          quality_score: average(evidence.map((item) => item.score), 0),
          reuse_score: null,
          safety_status: "AI_VERIFICATION_REQUIRED",
          tags: ["local-analysis", "zero-provider", "full-timeline"],
        },
        review: {
          ai_reviewed: false,
          human_reviewed: false,
          approved: false,
        },
        metadata: {
          local_shortlist_report: true,
          local_shortlist_plan_identity: planIdentity,
          local_shortlist_policy_version:
            text(policy.version) || LOCAL_POLICY_VERSION,
          source_asset_node_id: parent.id,
          source_duration_seconds: duration,
          silence_ranges: silences,
          detected_section_count: sections.length,
          candidate_ids: candidates.map((candidate) => candidate.id),
          candidates: candidates.map(candidateSummary),
          provider_calls: 0,
          wallet_charges: 0,
          created_at: new Date().toISOString(),
        },
      });
      const savedReport = await AssetGraphRepository.create(qualityReport);

      return {
        reused: false,
        source_asset_node_id: parent.id,
        plan_identity: planIdentity,
        quality_report: savedReport,
        candidates,
      };
    } finally {
      await materialized.cleanup();
      await fs.rm(directory, { recursive: true, force: true });
    }
  },

  async finalizeProject({
    organization_id,
    creative_project_id,
    policy = {},
    country = null,
    currency = null,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id,
    });
    const candidates = nodes.filter((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
      node.metadata?.local_shortlist_candidate === true &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
    );
    if (!candidates.length) {
      throw new Error("LOCAL_SHORTLIST_CANDIDATES_REQUIRED");
    }

    const selected = selectDiverseCandidates(candidates, policy);
    const selectedIds = new Set(selected.map((candidate) => candidate.id));
    const sourcePlanIdentities = [...new Set(candidates
      .map((candidate) => candidate.metadata?.local_shortlist_plan_identity)
      .filter(Boolean))]
      .sort();
    const sampleFractions = Array.isArray(policy.ai_sample_fractions)
      ? policy.ai_sample_fractions
      : Array.isArray(policy.aiSampleFractions)
        ? policy.aiSampleFractions
        : [0.35, 0.7];
    const projectShortlistIdentity = hash({
      version: text(policy.version) || PROJECT_POLICY_VERSION,
      creative_project_id,
      source_plan_identities: sourcePlanIdentities,
      selected_candidate_ids: selected.map((candidate) => candidate.id).sort(),
      ai_sample_fractions: sampleFractions,
    });

    for (const candidate of candidates) {
      const rank = selected.findIndex((item) => item.id === candidate.id);
      const chosen = rank >= 0;
      await AssetGraphRepository.update(candidate.id, {
        metadata: {
          ...object(candidate.metadata),
          selected_for_ai_verification: chosen,
          shortlist_rank: chosen ? rank + 1 : null,
          project_shortlist_identity: projectShortlistIdentity,
          ai_verification_status: chosen
            ? candidate.metadata?.ai_verification_status === "COMPLETE"
              ? "COMPLETE"
              : "PENDING_AUTHORIZATION"
            : "NOT_SELECTED",
          shortlist_finalized_at: new Date().toISOString(),
        },
      });
    }

    const estimatedAiCalls = selected.length * sampleFractions.length;
    const costEstimate = await estimatePaidAnalysis({
      organizationId: organization_id,
      callCount: estimatedAiCalls,
      country,
      currency,
      providerPolicy: policy.provider_policy || policy.providerPolicy || {},
    });
    const report = createCreativeAssetNode({
      organization_id,
      creative_project_id,
      type: CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT,
      status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
      name: "Project local media shortlist",
      description: "Diverse cross-source shortlist with exact bounded AI-verification workload and configured pricing.",
      lineage: {
        source: "local_media_shortlist",
        provider_id: null,
        capability: "creative.media.local.shortlist.finalize",
        generation_version: 1,
      },
      intelligence: {
        quality_score: average(selected.map((candidate) =>
          candidate.metadata?.local_score,
        ), 0),
        safety_status: "EXPLICIT_PAID_AUTHORIZATION_REQUIRED",
        tags: ["project-shortlist", "bounded-ai-verification"],
      },
      review: {
        ai_reviewed: false,
        human_reviewed: false,
        approved: false,
        notes: "Paid verification may start only with a matching explicit authorization envelope.",
      },
      metadata: {
        project_shortlist_report: true,
        project_shortlist_identity: projectShortlistIdentity,
        project_shortlist_policy_version:
          text(policy.version) || PROJECT_POLICY_VERSION,
        selected_candidate_ids: selected.map((candidate) => candidate.id),
        selected_candidates: selected.map(candidateSummary),
        source_plan_identities: sourcePlanIdentities,
        estimated_ai_calls: estimatedAiCalls,
        ai_sample_fractions: sampleFractions,
        cost_estimate: costEstimate,
        explicit_paid_authorization_required: true,
        paid_analysis_authorized: false,
        production_started: false,
        created_at: new Date().toISOString(),
      },
    });
    const savedReport = await AssetGraphRepository.create(report);

    return {
      project_shortlist_identity: projectShortlistIdentity,
      quality_report_id: savedReport.id,
      selected_candidate_count: selected.length,
      selected_candidates: selected.map(candidateSummary),
      estimated_ai_calls: estimatedAiCalls,
      ai_sample_fractions: sampleFractions,
      cost_estimate: costEstimate,
      explicit_paid_authorization_required: true,
      paid_analysis_authorized: false,
      production_started: false,
    };
  },

  async verifyProject({
    organization_id,
    creative_project_id,
    authorization = {},
    policy = {},
    country = null,
    currency = null,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id,
    });
    const reports = nodes.filter((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
      node.metadata?.project_shortlist_report === true &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
    ).sort((left, right) =>
      Date.parse(right.created_at || 0) - Date.parse(left.created_at || 0),
    );
    const report = reports[0];
    if (!report) throw new Error("PROJECT_SHORTLIST_REPORT_REQUIRED");

    const candidates = nodes.filter((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
      node.metadata?.local_shortlist_candidate === true &&
      node.metadata?.selected_for_ai_verification === true &&
      node.metadata?.project_shortlist_identity ===
        report.metadata?.project_shortlist_identity &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
    ).sort((left, right) =>
      finite(left.metadata?.shortlist_rank, 9999) -
      finite(right.metadata?.shortlist_rank, 9999),
    );
    if (!candidates.length) {
      throw new Error("PROJECT_SHORTLIST_SELECTION_REQUIRED");
    }

    const plan = {
      project_shortlist_identity:
        report.metadata?.project_shortlist_identity,
      estimated_ai_calls: finite(report.metadata?.estimated_ai_calls, 0),
      cost_estimate: object(report.metadata?.cost_estimate),
    };
    if (!plan.cost_estimate?.ready) {
      throw new Error(
        plan.cost_estimate?.blocking_reason ||
        "PAID_ANALYSIS_COST_ESTIMATE_NOT_READY",
      );
    }
    if (!explicitAuthorizationMatches({ authorization, plan })) {
      const error = new Error("PAID_ANALYSIS_AUTHORIZATION_MISMATCH");
      error.validation = {
        required: {
          approved: true,
          project_shortlist_identity: plan.project_shortlist_identity,
          minimum_maximum_ai_calls: plan.estimated_ai_calls,
          minimum_maximum_customer_price:
            plan.cost_estimate.estimated_customer_price,
          currency: plan.cost_estimate.currency,
        },
      };
      throw error;
    }

    const sampleFractions = Array.isArray(report.metadata?.ai_sample_fractions)
      ? report.metadata.ai_sample_fractions
      : [0.35, 0.7];
    const sourceIds = [...new Set(candidates
      .map((candidate) => text(candidate.metadata?.source_asset_node_id))
      .filter(Boolean))];
    const sources = new Map();
    for (const sourceId of sourceIds) {
      const source = await AssetGraphRepository.getById(sourceId);
      if (
        !source ||
        String(source.organization_id) !== String(organization_id) ||
        String(source.creative_project_id) !== String(creative_project_id)
      ) {
        throw new Error(`LOCAL_SHORTLIST_SOURCE_NOT_FOUND:${sourceId}`);
      }
      sources.set(sourceId, source);
    }

    const ffmpegPath =
      text(policy.ffmpeg_path || policy.ffmpegPath) ||
      text(process.env.CREATIVE_MEDIA_FFMPEG_PATH) ||
      null;
    if (!ffmpegPath) throw new Error("FFMPEG_NOT_CONFIGURED");
    const timeoutMs = finite(
      policy.timeout_ms ?? policy.timeoutMs ??
      process.env.CREATIVE_MEDIA_TEMPORAL_TIMEOUT_MS,
      60 * 60 * 1000,
    );
    let completedCalls = 0;
    const results = [];

    for (const sourceId of sourceIds) {
      const parent = sources.get(sourceId);
      const sourceCandidates = candidates.filter((candidate) =>
        text(candidate.metadata?.source_asset_node_id) === sourceId,
      );
      const materialized = await materializeMedia({
        url: parent.url,
        file_name: parent.name || null,
        mime_type: parent.technical?.mime_type || null,
        organization_id,
        policy,
      });
      const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), "avantiqo-shortlist-verify-"),
      );

      try {
        for (const candidate of sourceCandidates) {
          if (candidate.metadata?.ai_verification_status === "COMPLETE") {
            results.push({
              candidate_id: candidate.id,
              reused: true,
              verified_moment_ids:
                candidate.metadata?.verified_moment_ids || [],
            });
            continue;
          }

          await AssetGraphRepository.update(candidate.id, {
            metadata: {
              ...object(candidate.metadata),
              ai_verification_status: "RUNNING",
              ai_verification_started_at: new Date().toISOString(),
            },
          });

          try {
            const excerpt = await uploadExcerpt({
              organizationId: organization_id,
              parent,
              candidate,
              inputPath: materialized.file_path,
              directory,
              ffmpegPath,
              timeoutMs,
              policy,
            });
            const verified = await CreativePerformanceVideoIntelligenceRuntime.analyze({
              organization_id,
              parent_asset_node_id: excerpt.id,
              policy: {
                version: `bounded-shortlist-${plan.project_shortlist_identity}`,
                requested_subject:
                  text(policy.requested_subject || policy.requestedSubject) ||
                  "primary requested subject",
                minimum_usable_sections: 1,
                minimum_verified_samples: sampleFractions.length,
                minimum_quality_score:
                  finite(policy.minimum_quality_score, 55),
                minimum_primary_performer_ratio:
                  finite(policy.minimum_primary_performer_ratio, 0.5),
                minimum_vocalist_ratio:
                  finite(policy.minimum_vocalist_ratio, 0.5),
                minimum_section_seconds: 1,
                maximum_section_seconds:
                  finite(candidate.technical?.duration_seconds, 20) + 1,
                minimum_boundary_silence_seconds: 999999,
                sample_fractions: sampleFractions,
                output_width: finite(policy.output_width, 1920),
                output_height: finite(policy.output_height, 1080),
                frame_rate: finite(policy.frame_rate, 30),
                video_codec: text(policy.video_codec) || "libx264",
                video_preset: text(policy.video_preset) || "medium",
                video_crf: finite(policy.video_crf, 18),
                audio_codec: text(policy.audio_codec) || "aac",
                audio_bitrate: text(policy.audio_bitrate) || "192k",
                ffmpeg_path: ffmpegPath,
                timeout_ms: timeoutMs,
                max_bytes: Math.max(
                  finite(excerpt.technical?.file_size_bytes, 0) + 1024 * 1024,
                  finite(policy.max_bytes, 0),
                ),
              },
            });
            completedCalls += sampleFractions.length;
            if (completedCalls > plan.estimated_ai_calls) {
              throw new Error("PAID_ANALYSIS_CALL_BUDGET_EXCEEDED");
            }

            const verifiedMomentIds = [];
            for (const moment of verified.moments || []) {
              const updated = await AssetGraphRepository.update(moment.id, {
                metadata: {
                  ...object(moment.metadata),
                  source_asset_node_id: parent.id,
                  original_source_range:
                    candidate.metadata?.original_source_range || null,
                  local_shortlist_candidate_id: candidate.id,
                  project_shortlist_identity:
                    plan.project_shortlist_identity,
                  bounded_paid_verification: true,
                  estimated_call_count: sampleFractions.length,
                  configured_cost_estimate: plan.cost_estimate,
                },
              });
              verifiedMomentIds.push(updated.id);
            }

            await AssetGraphRepository.update(candidate.id, {
              metadata: {
                ...object(candidate.metadata),
                ai_verification_status: "COMPLETE",
                ai_verification_completed_at: new Date().toISOString(),
                verification_excerpt_node_id: excerpt.id,
                verified_moment_ids: verifiedMomentIds,
                paid_analysis_calls: sampleFractions.length,
              },
            });
            results.push({
              candidate_id: candidate.id,
              source_asset_node_id: parent.id,
              excerpt_node_id: excerpt.id,
              verified_moment_ids: verifiedMomentIds,
              reused: verified.reused === true,
            });
          } catch (error) {
            await AssetGraphRepository.update(candidate.id, {
              metadata: {
                ...object(candidate.metadata),
                ai_verification_status: "FAILED",
                ai_verification_failed_at: new Date().toISOString(),
                ai_verification_error: error?.message || String(error),
                ai_verification_validation: error?.validation || null,
              },
            });
            throw error;
          }
        }
      } finally {
        await materialized.cleanup();
        await fs.rm(directory, { recursive: true, force: true });
      }
    }

    await AssetGraphRepository.update(report.id, {
      status: CREATIVE_ASSET_NODE_STATUS.GENERATED,
      review: {
        ...object(report.review),
        ai_reviewed: true,
        approved: false,
        notes: "Bounded paid verification completed; human review remains required.",
      },
      metadata: {
        ...object(report.metadata),
        paid_analysis_authorized: true,
        paid_analysis_completed_at: new Date().toISOString(),
        completed_ai_calls: completedCalls,
        verification_results: results,
        production_started: false,
      },
    });

    return {
      project_shortlist_identity: plan.project_shortlist_identity,
      completed_ai_calls: completedCalls,
      configured_call_limit: finite(authorization.maximum_ai_calls),
      configured_price_limit: finite(authorization.maximum_customer_price),
      currency: plan.cost_estimate.currency,
      results,
      production_started: false,
    };
  },

  async status({ organization_id, creative_project_id } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id,
    });
    const sourceReports = nodes.filter((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
      node.metadata?.local_shortlist_report === true &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
    );
    const projectReports = nodes.filter((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
      node.metadata?.project_shortlist_report === true &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
    ).sort((left, right) =>
      Date.parse(right.created_at || 0) - Date.parse(left.created_at || 0),
    );
    const candidates = nodes.filter((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
      node.metadata?.local_shortlist_candidate === true &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
    );
    const selected = candidates.filter((node) =>
      node.metadata?.selected_for_ai_verification === true,
    );
    const verified = nodes.filter((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
      node.metadata?.performance_verified === true &&
      node.metadata?.bounded_paid_verification === true &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
    );
    const latest = projectReports[0] || null;

    return {
      creative_project_id,
      locally_analysed_source_count: sourceReports.length,
      local_candidate_count: candidates.length,
      selected_candidate_count: selected.length,
      selected_candidates: selected
        .sort((left, right) =>
          finite(left.metadata?.shortlist_rank, 9999) -
          finite(right.metadata?.shortlist_rank, 9999),
        )
        .map(candidateSummary),
      verified_moment_count: verified.length,
      verified_duration_seconds: Number(verified.reduce((sum, node) =>
        sum + finite(node.technical?.duration_seconds, 0),
      0).toFixed(3)),
      project_shortlist_identity:
        latest?.metadata?.project_shortlist_identity || null,
      estimated_ai_calls:
        finite(latest?.metadata?.estimated_ai_calls, 0),
      cost_estimate: latest?.metadata?.cost_estimate || null,
      explicit_paid_authorization_required:
        latest?.metadata?.explicit_paid_authorization_required === true,
      paid_analysis_authorized:
        latest?.metadata?.paid_analysis_authorized === true,
      production_started: false,
    };
  },
};
