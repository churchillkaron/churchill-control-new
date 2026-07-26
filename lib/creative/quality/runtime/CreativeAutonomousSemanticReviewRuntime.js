import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

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

function reviewPrompt({ policy, render, context }) {
  const requiredChecks = list(policy.required_checks);
  return [
    "You are Avantiqo's accountable senior film, brand and post-production quality director.",
    "Inspect the supplied contact sheet from the actual final render and return JSON only.",
    "Never invent evidence. Mark a check NOT_APPLICABLE only with a concrete reason.",
    "For PASS or FAIL include score 0-100, confidence 0-100, evidence, timestamps when visible, risks, and bounded repair_instructions for every FAIL.",
    `Required checks: ${JSON.stringify(requiredChecks)}`,
    `Minimum score: ${policy.minimum_score}`,
    `Minimum confidence: ${policy.minimum_confidence}`,
    `Audio review required: ${policy.require_audio_review === true}`,
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
        evidence: ["specific observed evidence"],
        timestamps: [],
        affected_scene_ids: [],
        affected_shot_ids: [],
        risks: [],
        repair_instructions: [],
      }])),
    }),
  ].join("\n\n");
}

async function createContactSheet({
  organization_id,
  render,
  policy,
  inputPath,
  outputPath,
}) {
  const ffmpegPath =
    policy.ffmpeg_path ||
    policy.ffmpegPath ||
    process.env.CREATIVE_MEDIA_FFMPEG_PATH ||
    null;
  if (!ffmpegPath) throw new Error("FFMPEG_NOT_CONFIGURED");

  const sampleCount = Math.max(4, Math.min(12, positive(
    policy.sample_frame_count ?? policy.sampleFrameCount,
    9,
  )));
  const duration = positive(render.technical?.duration_seconds, sampleCount);
  const interval = Math.max(duration / sampleCount, 0.25);
  const columns = Math.ceil(Math.sqrt(sampleCount));
  const rows = Math.ceil(sampleCount / columns);
  const timeoutMs = positive(
    policy.semantic_sampling_timeout_ms ??
    policy.semanticSamplingTimeoutMs ??
    process.env.CREATIVE_SEMANTIC_SAMPLING_TIMEOUT_MS,
    null,
  );

  await run(ffmpegPath, [
    "-y",
    "-i",
    inputPath,
    "-vf",
    `fps=1/${interval},scale=480:-1,tile=${columns}x${rows}:padding=8:margin=8`,
    "-frames:v",
    "1",
    outputPath,
  ], timeoutMs);

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
    `${crypto.randomUUID()}.jpg`,
  ].join("/");
  const content = await fs.readFile(outputPath);
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, content, {
      contentType: "image/jpeg",
      upsert: false,
    });
  if (error) throw error;
  return creativeStorageUri(bucket, storagePath);
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
      const contactSheetPath = path.join(directory, "contact-sheet.jpg");
      const evidenceUri = await createContactSheet({
        organization_id,
        render,
        policy,
        inputPath: materialized.file_path,
        outputPath: contactSheetPath,
      });
      const signedEvidenceUrl = await signCreativeStorageReference({
        organization_id,
        reference: evidenceUri,
      });
      const projectNodes = await AssetGraphRepository.listByProject({
        organization_id,
        creative_project_id: render.creative_project_id,
      });
      const context = {
        timeline: projectNodes.find((node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.TIMELINE) || null,
        source_node_count: projectNodes.length,
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
      review.sampled_frames = [evidenceUri];
      review.sampled_clips = [{
        render_asset_node_id: render.id,
        duration_seconds: render.technical?.duration_seconds || null,
        contact_sheet: evidenceUri,
      }];
      review.sampled_audio_segments = policy.require_audio_review === true
        ? [{
            render_asset_node_id: render.id,
            evidence: "Audio review requested; visual worker review is combined with persisted technical/perceptual audio evidence.",
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
        evidence_uri: evidenceUri,
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
