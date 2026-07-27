import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
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

const supabaseAdmin = getServiceSupabase();

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, finite(value, minimum)));
}

function average(values = [], fallback = null) {
  const numbers = values.map((value) => finite(value)).filter((value) => value !== null);
  if (!numbers.length) return fallback;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function safe(value, fallback = "media") {
  return text(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  const source = text(value);
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {
    const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (!fenced) return null;
    try {
      return JSON.parse(fenced);
    } catch {
      return null;
    }
  }
}

function executionOutput(execution = {}) {
  return (
    execution?.output?.output ||
    execution?.output?.text ||
    execution?.output ||
    null
  );
}

function runProcess(command, args, timeoutMs = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let timer = null;
    let settled = false;

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
        finish(new Error("PERFORMANCE_VIDEO_ANALYSIS_TIMEOUT"));
      }, timeoutMs);
    }

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", finish);
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(
          Buffer.concat(stderr).toString("utf8") ||
          `PERFORMANCE_VIDEO_ANALYSIS_EXIT_${code}`,
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
    12,
  );
  const maximumSection = finite(
    policy.maximum_section_seconds ?? policy.maximumSectionSeconds,
    75,
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
    if (end <= start) continue;
    raw.push({ start_seconds: start, end_seconds: end });
  }

  const merged = [];
  for (const range of raw) {
    const durationSeconds = range.end_seconds - range.start_seconds;
    if (durationSeconds >= minimumSection || !merged.length) {
      merged.push({ ...range });
      continue;
    }
    merged[merged.length - 1].end_seconds = range.end_seconds;
  }

  const sections = [];
  for (const range of merged) {
    const total = range.end_seconds - range.start_seconds;
    const parts = maximumSection > 0 ? Math.max(1, Math.ceil(total / maximumSection)) : 1;
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
  const fractions = Array.isArray(policy.sample_fractions)
    ? policy.sample_fractions
    : Array.isArray(policy.sampleFractions)
      ? policy.sampleFractions
      : [0.25, 0.5, 0.75];
  return [...new Set(fractions
    .map((fraction) => clamp(fraction, 0.05, 0.95))
    .map((fraction) => Number((
      section.start_seconds + section.duration_seconds * fraction
    ).toFixed(3))))];
}

function analysisPrompt({ section, sampleTime, requestedSubject }) {
  return `
You are Avantiqo's live-performance picture editor. Inspect this single frame as
production evidence only. Do not identify a private person by name. Determine
whether the frame clearly shows the requested primary live performer role and
whether it is safe to use for a premium artist showreel.

Requested performer role: ${requestedSubject || "the primary lead vocalist"}
Source section: ${section.start_seconds.toFixed(3)}-${section.end_seconds.toFixed(3)} seconds
Sample time: ${sampleTime.toFixed(3)} seconds

Return strict JSON only:
{
  "status":"VERIFIED|UNVERIFIED",
  "primary_performer_present":true,
  "lead_vocalist_present":true,
  "microphone_visible":true,
  "face_visibility_score":0,
  "technical_quality_score":0,
  "performance_energy_score":0,
  "usable_for_showreel":true,
  "framing":"CLOSE_UP|MEDIUM|WIDE|DETAIL|UNUSABLE",
  "subject_anchor":{"x":0.5,"y":0.5},
  "crop_safety":{"left":0,"right":1,"top":0,"bottom":1},
  "occlusion_risk":"LOW|MEDIUM|HIGH",
  "reasons":[]
}

Rules:
- Scores are 0-100.
- subject_anchor is the centre of the lead vocalist in normalised image coordinates.
- primary_performer_present requires a clearly visible human performance subject.
- lead_vocalist_present requires visible evidence of active singing or lead-vocal performance.
- usable_for_showreel must be false for empty stages, another musician as the dominant subject,
  severe blur, blocked face, unusable exposure, extreme digital zoom, or uncertain evidence.
- Do not infer identity, consent, profession, location or rights beyond visible evidence.
`;
}

function normalizeFrameAnalysis(value = {}) {
  const result = value?.result || value || {};
  const status = text(result.status).toUpperCase() === "VERIFIED"
    ? "VERIFIED"
    : "UNVERIFIED";
  const anchor = result.subject_anchor || {};
  return {
    status,
    primary_performer_present: result.primary_performer_present === true,
    lead_vocalist_present: result.lead_vocalist_present === true,
    microphone_visible: result.microphone_visible === true,
    face_visibility_score: clamp(result.face_visibility_score, 0, 100),
    technical_quality_score: clamp(result.technical_quality_score, 0, 100),
    performance_energy_score: clamp(result.performance_energy_score, 0, 100),
    usable_for_showreel: result.usable_for_showreel === true,
    framing: text(result.framing).toUpperCase() || "UNUSABLE",
    subject_anchor: {
      x: clamp(anchor.x, 0, 1),
      y: clamp(anchor.y, 0, 1),
    },
    crop_safety: result.crop_safety || null,
    occlusion_risk: text(result.occlusion_risk).toUpperCase() || "UNKNOWN",
    reasons: Array.isArray(result.reasons) ? result.reasons.map(text).filter(Boolean) : [],
  };
}

function sectionEvidence(section, frames, policy = {}) {
  const verified = frames.filter((frame) => frame.analysis.status === "VERIFIED");
  const requiredSamples = Math.max(1, finite(
    policy.minimum_verified_samples ?? policy.minimumVerifiedSamples,
    2,
  ));
  const primaryRatio = verified.length
    ? verified.filter((frame) => frame.analysis.primary_performer_present).length / verified.length
    : 0;
  const vocalistRatio = verified.length
    ? verified.filter((frame) => frame.analysis.lead_vocalist_present).length / verified.length
    : 0;
  const usableRatio = verified.length
    ? verified.filter((frame) => frame.analysis.usable_for_showreel).length / verified.length
    : 0;
  const microphoneRatio = verified.length
    ? verified.filter((frame) => frame.analysis.microphone_visible).length / verified.length
    : 0;
  const quality = average(
    verified.map((frame) => frame.analysis.technical_quality_score),
    0,
  );
  const face = average(
    verified.map((frame) => frame.analysis.face_visibility_score),
    0,
  );
  const energy = average(
    verified.map((frame) => frame.analysis.performance_energy_score),
    0,
  );
  const minimumQuality = finite(
    policy.minimum_quality_score ?? policy.minimumQualityScore,
    55,
  );
  const minimumVocalistRatio = finite(
    policy.minimum_vocalist_ratio ?? policy.minimumVocalistRatio,
    0.5,
  );
  const minimumPrimaryRatio = finite(
    policy.minimum_primary_performer_ratio ?? policy.minimumPrimaryPerformerRatio,
    0.5,
  );
  const usable =
    verified.length >= requiredSamples &&
    primaryRatio >= minimumPrimaryRatio &&
    vocalistRatio >= minimumVocalistRatio &&
    usableRatio >= 0.5 &&
    quality >= minimumQuality;
  const score = clamp(
    quality * 0.35 +
    face * 0.2 +
    energy * 0.15 +
    primaryRatio * 100 * 0.12 +
    vocalistRatio * 100 * 0.13 +
    microphoneRatio * 100 * 0.05,
    0,
    100,
  );
  const anchors = verified
    .filter((frame) => frame.analysis.primary_performer_present)
    .map((frame) => ({
      time_seconds: frame.time_seconds,
      x: frame.analysis.subject_anchor.x,
      y: frame.analysis.subject_anchor.y,
    }));
  const first = anchors[0] || { x: 0.5, y: 0.5 };
  const last = anchors[anchors.length - 1] || first;
  const dominantFraming = verified
    .map((frame) => frame.analysis.framing)
    .filter(Boolean)
    .sort((left, right) =>
      verified.filter((frame) => frame.analysis.framing === right).length -
      verified.filter((frame) => frame.analysis.framing === left).length,
    )[0] || "UNUSABLE";

  return {
    section,
    verified_sample_count: verified.length,
    requested_sample_count: frames.length,
    primary_performer_ratio: primaryRatio,
    lead_vocalist_ratio: vocalistRatio,
    usable_ratio: usableRatio,
    microphone_ratio: microphoneRatio,
    quality_score: quality,
    face_visibility_score: face,
    performance_energy_score: energy,
    score,
    usable,
    dominant_framing: dominantFraming,
    anchors,
    reframe_plan: {
      version: "tracked-reframe-v1",
      mode: "TRACKED_PAN_PUSH",
      output_width: Math.max(1, finite(policy.output_width ?? policy.outputWidth, 1920)),
      output_height: Math.max(1, finite(policy.output_height ?? policy.outputHeight, 1080)),
      anchor_start: { x: clamp(first.x), y: clamp(first.y) },
      anchor_end: { x: clamp(last.x), y: clamp(last.y) },
      zoom_start: 1,
      zoom_end: dominantFraming === "WIDE" ? 1.08 : 1.04,
      avoid_blurred_background: true,
      preserve_source_audio: true,
      preserve_lip_sync: true,
    },
    frames,
  };
}

function identity(parent, policy) {
  return crypto.createHash("sha256").update(JSON.stringify({
    parent_id: parent.id,
    checksum: parent.technical?.checksum || parent.technical?.checksum_sha256 || null,
    version: policy.version || "performance-video-v1",
    silence_noise_db: policy.silence_noise_db ?? policy.silenceNoiseDb ?? -32,
    silence_duration_seconds:
      policy.silence_duration_seconds ?? policy.silenceDurationSeconds ?? 1.2,
    sample_fractions: policy.sample_fractions || policy.sampleFractions || [0.25, 0.5, 0.75],
    output_width: policy.output_width || policy.outputWidth || 1920,
    output_height: policy.output_height || policy.outputHeight || 1080,
  })).digest("hex");
}

async function uploadPrivate({ bucket, storagePath, buffer, contentType }) {
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
      cacheControl: "3600",
    });
  if (error) throw error;
  return creativeStorageUri(bucket, storagePath);
}

async function analyseSample({
  organizationId,
  parent,
  section,
  sampleTime,
  inputPath,
  directory,
  ffmpegPath,
  timeoutMs,
  requestedSubject,
}) {
  const framePath = path.join(
    directory,
    `sample-${section.index}-${String(sampleTime).replace(/\./g, "-")}.jpg`,
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

  const bucket = text(process.env.CREATIVE_MEDIA_DERIVATIVE_BUCKET);
  if (!bucket) throw new Error("DERIVATIVE_STORAGE_BUCKET_REQUIRED");
  const storagePath = [
    safe(organizationId),
    "analysis-frames",
    safe(parent.id),
    `${crypto.randomUUID()}.jpg`,
  ].join("/");
  const buffer = await fs.readFile(framePath);
  await uploadPrivate({
    bucket,
    storagePath,
    buffer,
    contentType: "image/jpeg",
  });

  try {
    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(storagePath, 15 * 60);
    if (signedError) throw signedError;
    if (!signed?.signedUrl) throw new Error("PERFORMANCE_ANALYSIS_SIGNED_URL_REQUIRED");

    const execution = await ServiceExecutionRuntime.execute({
      organization_id: organizationId,
      service_id: "ai.image.analyze",
      provider_id: null,
      input: {
        prompt: analysisPrompt({ section, sampleTime, requestedSubject }),
        image: signed.signedUrl,
      },
      metadata: {
        module: "CREATIVE",
        operation: "PERFORMANCE_VIDEO_FRAME_ANALYSIS",
        source_asset_node_id: parent.id,
        section_index: section.index,
        sample_time_seconds: sampleTime,
      },
      category: "CREATIVE_PERFORMANCE_VIDEO_INTELLIGENCE",
    });
    const parsed = parseJson(executionOutput(execution));
    if (!parsed) throw new Error("PERFORMANCE_FRAME_ANALYSIS_INVALID_JSON");
    return {
      time_seconds: sampleTime,
      analysis: normalizeFrameAnalysis(parsed),
      usage_id: execution?.usage?.id || execution?.usage_id || null,
      provider: execution?.provider || null,
      model: execution?.model || null,
    };
  } finally {
    await supabaseAdmin.storage.from(bucket).remove([storagePath]);
  }
}

async function createReframedDerivative({
  organizationId,
  parent,
  evidence,
  inputPath,
  directory,
  ffmpegPath,
  timeoutMs,
  policy,
}) {
  const plan = evidence.reframe_plan;
  const width = Math.round(plan.output_width);
  const height = Math.round(plan.output_height);
  const duration = evidence.section.duration_seconds;
  const startX = clamp(plan.anchor_start.x);
  const startY = clamp(plan.anchor_start.y);
  const endX = clamp(plan.anchor_end.x);
  const endY = clamp(plan.anchor_end.y);
  const zoomDelta = clamp(plan.zoom_end - plan.zoom_start, 0, 0.2);
  const progress = `min(max(t/${duration.toFixed(6)},0),1)`;
  const zoom = `(1+${zoomDelta.toFixed(6)}*${progress})`;
  const anchorX = `(${startX.toFixed(6)}+(${endX.toFixed(6)}-${startX.toFixed(6)})*${progress})`;
  const anchorY = `(${startY.toFixed(6)}+(${endY.toFixed(6)}-${startY.toFixed(6)})*${progress})`;
  const filters = [
    `scale=w='iw*max(${width}/iw,${height}/ih)*${zoom}':h='ih*max(${width}/iw,${height}/ih)*${zoom}':eval=frame`,
    `crop=${width}:${height}:x='max(0,min(iw-ow,(iw-ow)*${anchorX}))':y='max(0,min(ih-oh,(ih-oh)*${anchorY}))'`,
    `fps=${Math.max(1, finite(policy.frame_rate ?? policy.frameRate, 30))}`,
    "setsar=1",
    "format=yuv420p",
  ].join(",");
  const outputPath = path.join(directory, `section-${evidence.section.index}.mp4`);

  await runProcess(ffmpegPath, [
    "-hide_banner",
    "-loglevel", "error",
    "-ss", String(evidence.section.start_seconds),
    "-i", inputPath,
    "-t", String(duration),
    "-map", "0:v:0",
    "-map", "0:a:0?",
    "-vf", filters,
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
  const storagePath = [
    safe(organizationId),
    "performance-sections",
    safe(parent.id),
    `${crypto.randomUUID()}.mp4`,
  ].join("/");
  const buffer = await fs.readFile(outputPath);
  const url = await uploadPrivate({
    bucket,
    storagePath,
    buffer,
    contentType: "video/mp4",
  });

  const derivative = createCreativeAssetNode({
    organization_id: organizationId,
    creative_project_id: parent.creative_project_id,
    creative_asset_id: parent.creative_asset_id,
    parent_asset_node_id: parent.id,
    type: CREATIVE_ASSET_NODE_TYPES.VIDEO,
    status: CREATIVE_ASSET_NODE_STATUS.DERIVED,
    name: `${parent.name || "Performance video"} section ${evidence.section.index + 1}`,
    description: "Subject-aware reframed live-performance section with original source audio.",
    url,
    storage_path: storagePath,
    lineage: {
      source: "performance_video_reframe",
      provider_id: null,
      capability: "creative.video.reframe",
      generation_version: 1,
    },
    technical: {
      mime_type: "video/mp4",
      width,
      height,
      duration_seconds: duration,
      audio_codec: text(policy.audio_codec || policy.audioCodec) || "aac",
      media_kind: "video",
      file_size_bytes: buffer.length,
    },
    intelligence: {
      quality_score: evidence.quality_score,
      brand_match_score: null,
      reuse_score: evidence.score,
      safety_status: "REVIEW_REQUIRED",
      tags: [
        "live-performance",
        "lead-vocalist-verified",
        "tracked-reframe",
        "source-audio-preserved",
      ],
      detected_people: [{ role: "primary lead vocalist", confidence: evidence.lead_vocalist_ratio }],
    },
    review: {
      ai_reviewed: true,
      human_reviewed: false,
      approved: false,
      notes: "Requires final human review before release.",
    },
    metadata: {
      source_asset_node_id: parent.id,
      source_range: evidence.section,
      performance_evidence: evidence,
      reframe_plan: plan,
      original_audio_required: true,
      exact_lip_sync_required: true,
      blurred_background_used: false,
      created_at: new Date().toISOString(),
    },
  });
  return AssetGraphRepository.create(derivative);
}

export const CreativePerformanceVideoIntelligenceRuntime = {
  async analyze({
    organization_id,
    parent_asset_node_id,
    policy = {},
    force = false,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!parent_asset_node_id) throw new Error("parent_asset_node_id required");

    const parent = await AssetGraphRepository.getById(parent_asset_node_id);
    if (!parent || String(parent.organization_id) !== String(organization_id)) {
      throw new Error("Parent asset node not found");
    }
    if (!parent.url) throw new Error("Parent asset node has no media URL");
    if (parent.type !== CREATIVE_ASSET_NODE_TYPES.VIDEO) {
      throw new Error("VIDEO_ASSET_REQUIRED");
    }
    if (!parent.creative_project_id) {
      throw new Error("VIDEO_ASSET_PROJECT_ASSIGNMENT_REQUIRED");
    }

    const analysisIdentity = identity(parent, policy);
    const projectNodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: parent.creative_project_id,
    });
    const existing = !force
      ? projectNodes.filter((node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
          node.metadata?.performance_analysis_identity === analysisIdentity,
        )
      : [];
    if (existing.length) {
      return {
        moments: existing,
        reused: true,
        analysis_identity: analysisIdentity,
      };
    }

    const ffmpegPath =
      policy.ffmpeg_path ||
      policy.ffmpegPath ||
      process.env.CREATIVE_MEDIA_FFMPEG_PATH ||
      null;
    if (!ffmpegPath) throw new Error("FFMPEG_NOT_CONFIGURED");

    const timeoutMs = finite(
      policy.timeout_ms ??
      policy.timeoutMs ??
      process.env.CREATIVE_MEDIA_TEMPORAL_TIMEOUT_MS,
      60 * 60 * 1000,
    );
    const duration = finite(parent.technical?.duration_seconds);
    if (!duration || duration <= 0) {
      throw new Error("VIDEO_DURATION_EVIDENCE_REQUIRED");
    }

    const materialized = await materializeMedia({
      url: parent.url,
      file_name: parent.name || null,
      mime_type: parent.technical?.mime_type || null,
      organization_id,
      policy,
    });
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "avantiqo-performance-video-"),
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
      const requestedSubject = text(
        policy.requested_subject || policy.requestedSubject || "primary lead vocalist",
      );
      const evidence = [];

      for (const section of sections) {
        const frames = [];
        for (const sampleTime of sampleTimes(section, policy)) {
          frames.push(await analyseSample({
            organizationId: organization_id,
            parent,
            section,
            sampleTime,
            inputPath: materialized.file_path,
            directory,
            ffmpegPath,
            timeoutMs,
            requestedSubject,
          }));
        }
        evidence.push(sectionEvidence(section, frames, policy));
      }

      const usable = evidence.filter((item) => item.usable);
      const minimumUsable = Math.max(1, finite(
        policy.minimum_usable_sections ?? policy.minimumUsableSections,
        1,
      ));
      if (usable.length < minimumUsable) {
        const error = new Error("PERFORMANCE_VIDEO_HAS_NO_VERIFIED_USABLE_SECTIONS");
        error.validation = {
          parent_asset_node_id,
          required_usable_sections: minimumUsable,
          detected_sections: evidence.map((item) => ({
            section: item.section,
            score: item.score,
            usable: item.usable,
            verified_sample_count: item.verified_sample_count,
            primary_performer_ratio: item.primary_performer_ratio,
            lead_vocalist_ratio: item.lead_vocalist_ratio,
            quality_score: item.quality_score,
          })),
        };
        throw error;
      }

      const moments = [];
      for (const item of usable) {
        const derivative = await createReframedDerivative({
          organizationId: organization_id,
          parent,
          evidence: item,
          inputPath: materialized.file_path,
          directory,
          ffmpegPath,
          timeoutMs,
          policy,
        });
        const moment = createCreativeAssetNode({
          organization_id,
          creative_project_id: parent.creative_project_id,
          creative_asset_id: parent.creative_asset_id,
          parent_asset_node_id: derivative.id,
          type: CREATIVE_ASSET_NODE_TYPES.MOMENT,
          status: CREATIVE_ASSET_NODE_STATUS.DERIVED,
          name: `${derivative.name} performance moment`,
          description: "Verified live lead-vocal performance section.",
          url: derivative.url,
          storage_path: derivative.storage_path,
          lineage: {
            source: "performance_video_intelligence",
            provider_id: null,
            capability: "creative.performance.section.analyze",
            generation_version: 1,
          },
          technical: {
            ...derivative.technical,
            duration_seconds: item.section.duration_seconds,
          },
          intelligence: {
            ...derivative.intelligence,
            quality_score: item.quality_score,
            reuse_score: item.score,
            safety_status: "REVIEW_REQUIRED",
          },
          review: {
            ai_reviewed: true,
            human_reviewed: false,
            approved: false,
          },
          metadata: {
            performance_analysis_identity: analysisIdentity,
            performance_verified: true,
            source_asset_node_id: parent.id,
            source_clip_node_id: derivative.id,
            clip_range: {
              start_seconds: 0,
              end_seconds: item.section.duration_seconds,
              duration_seconds: item.section.duration_seconds,
            },
            original_source_range: item.section,
            score: item.score,
            score_signals: {
              quality: item.quality_score,
              face_visibility: item.face_visibility_score,
              performance_energy: item.performance_energy_score,
              primary_performer: item.primary_performer_ratio * 100,
              lead_vocalist: item.lead_vocalist_ratio * 100,
              microphone: item.microphone_ratio * 100,
            },
            performance_evidence: item,
            reframe_plan: item.reframe_plan,
            original_audio_preserved: true,
            exact_lip_sync_required: true,
            blurred_background_used: false,
            blocked: false,
            created_at: new Date().toISOString(),
          },
        });
        moments.push(await AssetGraphRepository.create(moment));
      }

      return {
        moments,
        reused: false,
        analysis_identity: analysisIdentity,
        silence_ranges: silences,
        detected_sections: evidence,
      };
    } finally {
      await materialized.cleanup();
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
};
