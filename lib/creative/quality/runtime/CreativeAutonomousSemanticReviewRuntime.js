import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { runAIService } from "@/lib/platform/service-runtime/ai";
import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  creativeStorageUri,
  signCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CreativeSemanticQualityRuntime,
} from "@/lib/creative/quality/runtime/CreativeSemanticQualityRuntime";

const supabaseAdmin = getServiceSupabase();

function text(value) {
  return String(value ?? "").trim();
}

function positive(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function safe(value, fallback = "semantic-review") {
  return text(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const stderr = [];
    let timer = null;
    let settled = false;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    if (timeoutMs) {
      timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(new Error("SEMANTIC_REVIEW_SAMPLING_TIMEOUT"));
      }, timeoutMs);
    }
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", finish);
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(
          Buffer.concat(stderr).toString("utf8") ||
          `SEMANTIC_REVIEW_SAMPLING_EXIT_${code}`,
        ));
        return;
      }
      finish();
    });
  });
}

function unwrapExecution(result = {}) {
  let current = result?.output || result;
  const seen = new Set();
  while (
    current &&
    typeof current === "object" &&
    current.output &&
    typeof current.output === "object" &&
    !seen.has(current)
  ) {
    seen.add(current);
    current = current.output;
  }
  return current || {};
}

function parseReview(value) {
  const source = text(value)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(`AUTONOMOUS_SEMANTIC_REVIEW_INVALID_JSON:${error.message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AUTONOMOUS_SEMANTIC_REVIEW_OBJECT_REQUIRED");
  }
  return parsed;
}

function finalAudioEvidence(render = {}, projectNodes = []) {
  const sourceId = render.metadata?.master_soundtrack_asset_node_id || null;
  const source = sourceId
    ? projectNodes.find((node) => node.id === sourceId) || null
    : null;
  const after = render.metadata?.master_soundtrack_integrity_after_finishing || null;
  const before =
    render.metadata?.master_soundtrack_integrity_before_finishing ||
    render.metadata?.master_soundtrack_integrity ||
    null;

  return {
    contract: "CREATIVE_FINAL_AUDIO_EVIDENCE_V1",
    source_asset_node_id: sourceId,
    source_human_reviewed: source?.review?.human_reviewed === true,
    source_approved: source?.review?.approved === true,
    source_status: source?.status || null,
    master_soundtrack_contract_hash:
      render.metadata?.master_soundtrack_contract_hash || null,
    master_audio_stream_copy:
      render.metadata?.master_audio_stream_copy === true,
    integrity_before_finishing: before,
    integrity_after_finishing: after,
    final_master_audio_verified:
      render.metadata?.final_master_audio_verified === true,
    evidence_scope:
      "STRUCTURED_APPROVAL_AND_MEASURED_PCM_INTEGRITY;NO_ACOUSTIC_LISTENING_CLAIM",
  };
}

function reviewPrompt({ policy, render, context }) {
  const requiredChecks = list(policy.required_checks);
  return [
    "You are Avantiqo's accountable senior film, brand and post-production quality director.",
    "Inspect the supplied forensic contact sheet from the actual final render and return JSON only.",
    "The evidence image contains broad whole-film coverage plus dense adjacent-frame temporal strips. Treat adjacent-frame drift as release-blocking evidence, even when isolated frames look attractive.",
    "WORLD-CLASS AGENCY RULE: a film must not merely look technically valid. Reject visible generative signatures including identity drift, anatomy drift, object/venue geometry drift, texture boiling, unstable reflections, fake contact physics, impossible camera acceleration, rubbery motion, morph-heavy transitions, invented brand/text, over-smoothed skin, repeated model signatures, generic luxury replacement imagery, and incoherent lighting continuity.",
    "Do not average away a defect. The weakest visible critical dimension governs release readiness.",
    "Exact logos, readable text, legal copy and brand marks must be deterministic finishing evidence; generated approximations are not acceptable.",
    "Prefer authentic editorial cuts, occlusion, reflection, match cuts and restrained physical camera language over visible AI transformation effects.",
    "Never invent evidence. Mark a check NOT_APPLICABLE only with a concrete reason.",
    "For PASS or FAIL include score 0-100, confidence 0-100, evidence, timestamps when visible, risks, and bounded repair_instructions for every FAIL.",
    "For temporal failures in identity, anatomy, physics, camera, motion, environment, continuity, repetitive model signatures or synthetic artifacts, timestamps are mandatory.",
    "IMPORTANT AUDIO EVIDENCE RULE: the supplied forensic sheet has no audible signal. For music_and_sound_design and mix_hierarchy_and_silence, do not claim that you heard or acoustically inspected the film. Use only the supplied structured final_audio evidence. If that evidence is missing or contradictory, FAIL the relevant audio check.",
    `Required checks: ${JSON.stringify(requiredChecks)}`,
    `Minimum score: ${policy.minimum_score}`,
    `Per-check minimums: ${JSON.stringify(policy.check_minimum_scores || {})}`,
    `Minimum confidence: ${policy.minimum_confidence}`,
    `Audio review required: ${policy.require_audio_review === true}`,
    `Forensic temporal review required: ${policy.forensic_temporal_review_required === true}`,
    `Render evidence: ${JSON.stringify({
      id: render.id,
      name: render.name,
      technical: render.technical,
      context,
    })}`,
    "Return this exact shape:",
    JSON.stringify({
      version: policy.version,
      reviewer: "Avantiqo Autonomous Semantic Review Worker",
      reviewer_type: "AI",
      summary: "Specific evidence-based conclusion",
      checks: Object.fromEntries(requiredChecks.map((id) => [id, {
        status: "PASS|FAIL|NOT_APPLICABLE",
        passed: true,
        score: 0,
        confidence: 0,
        evidence: ["specific observed or structured evidence"],
        timestamps: [],
        affected_scene_ids: [],
        affected_shot_ids: [],
        risks: [],
        repair_instructions: [],
      }])),
    }),
  ].join("\n\n");
}

async function renderSheet({ ffmpegPath, inputPath, outputPath, filter, timeoutMs, seek = null, duration = null }) {
  const args = ["-y"];
  if (seek !== null) args.push("-ss", String(seek));
  args.push("-i", inputPath);
  if (duration !== null) args.push("-t", String(duration));
  args.push("-vf", filter, "-frames:v", "1", outputPath);
  await run(ffmpegPath, args, timeoutMs);
}

async function createForensicContactSheet({
  organization_id,
  render,
  policy,
  inputPath,
  directory,
}) {
  const ffmpegPath =
    policy.ffmpeg_path ||
    policy.ffmpegPath ||
    process.env.CREATIVE_MEDIA_FFMPEG_PATH ||
    null;
  if (!ffmpegPath) throw new Error("FFMPEG_NOT_CONFIGURED");

  const sampleCount = Math.max(8, Math.min(16, positive(
    policy.sample_frame_count ?? policy.sampleFrameCount,
    12,
  )));
  const duration = positive(render.technical?.duration_seconds, sampleCount);
  const interval = Math.max(duration / sampleCount, 0.25);
  const columns = 4;
  const rows = Math.ceil(sampleCount / columns);
  const timeoutMs = positive(
    policy.semantic_sampling_timeout_ms ??
    policy.semanticSamplingTimeoutMs ??
    process.env.CREATIVE_SEMANTIC_SAMPLING_TIMEOUT_MS,
    null,
  );

  const overviewPath = path.join(directory, "overview.jpg");
  await renderSheet({
    ffmpegPath,
    inputPath,
    outputPath: overviewPath,
    filter: `fps=1/${interval},scale=420:-1,tile=${columns}x${rows}:padding=6:margin=6`,
    timeoutMs,
  });

  const windowCount = Math.max(1, Math.min(3, positive(policy.dense_temporal_window_count, 3)));
  const windowSeconds = Math.min(Math.max(positive(policy.dense_temporal_window_seconds, 0.6), 0.3), 1.2);
  const framesPerWindow = Math.max(3, Math.min(6, positive(policy.dense_temporal_frame_count, 4)));
  const centers = windowCount === 1
    ? [duration / 2]
    : Array.from({ length: windowCount }, (_, index) =>
        duration * (0.15 + (0.70 * index) / Math.max(1, windowCount - 1)),
      );
  const strips = [];
  const temporalWindows = [];

  for (let index = 0; index < centers.length; index += 1) {
    const start = Math.max(0, Math.min(duration - windowSeconds, centers[index] - windowSeconds / 2));
    const stripPath = path.join(directory, `temporal-${index + 1}.jpg`);
    const fps = Math.max(framesPerWindow / windowSeconds, 1);
    await renderSheet({
      ffmpegPath,
      inputPath,
      outputPath: stripPath,
      filter: `fps=${fps},scale=420:-1,tile=${framesPerWindow}x1:padding=6:margin=6`,
      timeoutMs,
      seek: start,
      duration: windowSeconds,
    });
    strips.push(stripPath);
    temporalWindows.push({
      index: index + 1,
      start_seconds: Number(start.toFixed(3)),
      end_seconds: Number(Math.min(duration, start + windowSeconds).toFixed(3)),
      frame_count: framesPerWindow,
      purpose: "ADJACENT_FRAME_TEMPORAL_FORENSICS",
    });
  }

  const images = [overviewPath, ...strips];
  const metadata = await Promise.all(images.map((file) => sharp(file).metadata()));
  const width = Math.max(...metadata.map((item) => Number(item.width || 0)));
  const heights = metadata.map((item) => Number(item.height || 0));
  const gap = 16;
  const totalHeight = heights.reduce((sum, value) => sum + value, 0) + gap * (images.length - 1);
  let top = 0;
  const composites = [];
  for (let index = 0; index < images.length; index += 1) {
    composites.push({ input: images[index], top, left: 0 });
    top += heights[index] + gap;
  }

  const outputPath = path.join(directory, "forensic-contact-sheet.jpg");
  await sharp({
    create: {
      width,
      height: totalHeight,
      channels: 3,
      background: { r: 12, g: 12, b: 12 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toFile(outputPath);

  const bucket =
    policy.semantic_evidence_bucket ||
    policy.semanticEvidenceBucket ||
    process.env.CREATIVE_MEDIA_DERIVATIVE_BUCKET ||
    null;
  if (!bucket) throw new Error("SEMANTIC_EVIDENCE_STORAGE_BUCKET_REQUIRED");
  const storagePath = [
    safe(organization_id),
    "semantic-evidence",
    safe(render.creative_project_id),
    safe(render.id),
    `${crypto.randomUUID()}-forensic.jpg`,
  ].join("/");
  const content = await fs.readFile(outputPath);
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, content, {
      contentType: "image/jpeg",
      upsert: false,
    });
  if (error) throw error;

  return {
    evidence_uri: creativeStorageUri(bucket, storagePath),
    temporal_windows: temporalWindows,
    overview_sample_count: sampleCount,
    forensic_temporal_review: true,
    evidence_contract: "CREATIVE_FORENSIC_TEMPORAL_CONTACT_SHEET_V1",
  };
}

export const CreativeAutonomousSemanticReviewRuntime = {
  async analyze({
    organization_id,
    render_asset_node_id,
    policy = {},
    provider_id = null,
    force = false,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!render_asset_node_id) throw new Error("render_asset_node_id required");
    if (!text(policy.version)) throw new Error("SEMANTIC_POLICY_VERSION_REQUIRED");
    if (!text(policy.service_id)) throw new Error("SEMANTIC_REVIEW_SERVICE_ID_REQUIRED");
    if (!text(policy.model)) throw new Error("SEMANTIC_REVIEW_MODEL_REQUIRED");

    const render = await AssetGraphRepository.getById(render_asset_node_id);
    if (
      !render ||
      render.organization_id !== organization_id ||
      render.type !== CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER
    ) {
      throw new Error("Final render asset not found");
    }

    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "avantiqo-semantic-review-"),
    );
    const materialized = await materializeMedia({
      url: render.url,
      file_name: render.name || null,
      mime_type: render.technical?.mime_type || null,
      organization_id,
      policy,
    });

    try {
      const forensic = await createForensicContactSheet({
        organization_id,
        render,
        policy,
        inputPath: materialized.file_path,
        directory,
      });
      const signedEvidenceUrl = await signCreativeStorageReference({
        organization_id,
        reference: forensic.evidence_uri,
      });
      const projectNodes = await AssetGraphRepository.listByProject({
        organization_id,
        creative_project_id: render.creative_project_id,
      });
      const audioEvidence = finalAudioEvidence(render, projectNodes);
      const context = {
        timeline: projectNodes.find((node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.TIMELINE) || null,
        source_node_count: projectNodes.length,
        final_audio: audioEvidence,
        forensic_temporal_evidence: {
          contract: forensic.evidence_contract,
          overview_sample_count: forensic.overview_sample_count,
          windows: forensic.temporal_windows,
        },
      };
      const execution = await runAIService.execute({
        organization_id,
        service_id: policy.service_id,
        provider_id: provider_id || policy.provider_id || null,
        input: {
          capability: policy.capability || "ai.image.analyze",
          model: policy.model,
          image: signedEvidenceUrl,
          prompt: reviewPrompt({ policy, render, context }),
          temperature: 0,
          max_output_tokens: positive(policy.max_output_tokens, 12000),
        },
        metadata: {
          creative_project_id: render.creative_project_id,
          render_asset_node_id: render.id,
          operation: "AUTONOMOUS_SEMANTIC_REVIEW",
          evidence_contract: forensic.evidence_contract,
        },
        provider_policy: policy.provider_policy || {},
      });
      if (execution.pending) {
        throw new Error("ASYNCHRONOUS_SEMANTIC_REVIEW_NOT_SUPPORTED");
      }
      const output = unwrapExecution(execution);
      const review = parseReview(output.text || output.response || output.result);
      review.version = review.version || policy.version;
      review.reviewer = review.reviewer || "Avantiqo Autonomous Semantic Review Worker";
      review.reviewer_type = "AI";
      review.ai_reviewed = true;
      review.sampled_frames = [forensic.evidence_uri];
      review.sampled_clips = [{
        render_asset_node_id: render.id,
        duration_seconds: render.technical?.duration_seconds || null,
        contact_sheet: forensic.evidence_uri,
        forensic_temporal_review: true,
        evidence_contract: forensic.evidence_contract,
        temporal_windows: forensic.temporal_windows,
      }];
      review.sampled_audio_segments = policy.require_audio_review === true
        ? [{
            render_asset_node_id: render.id,
            evidence_contract: audioEvidence.contract,
            evidence_scope: audioEvidence.evidence_scope,
            source_asset_node_id: audioEvidence.source_asset_node_id,
            source_human_reviewed: audioEvidence.source_human_reviewed,
            source_approved: audioEvidence.source_approved,
            master_audio_stream_copy: audioEvidence.master_audio_stream_copy,
            final_master_audio_verified: audioEvidence.final_master_audio_verified,
            integrity_before_finishing: audioEvidence.integrity_before_finishing,
            integrity_after_finishing: audioEvidence.integrity_after_finishing,
          }]
        : [];

      const recorded = await CreativeSemanticQualityRuntime.record({
        organization_id,
        render_asset_node_id: render.id,
        review,
        policy,
        force,
      });
      return {
        ...recorded,
        autonomous: true,
        evidence_uri: forensic.evidence_uri,
        forensic_temporal_evidence: forensic,
        audio_evidence: audioEvidence,
        provider: execution.provider || null,
        model: execution.model || policy.model,
        pricing: execution.pricing || null,
        usage: execution.usage || null,
        billing: execution.billing || null,
      };
    } finally {
      await materialized.cleanup();
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
};
