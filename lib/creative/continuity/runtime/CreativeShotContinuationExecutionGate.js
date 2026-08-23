import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeGeneratedMediaPerceptualExecutionGate,
} from "@/lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate";
import "@/lib/creative/quality/runtime/CreativeCinemaEndpointFidelityExecutionGate";
import "@/lib/creative/continuity/runtime/CreativeClosingKeyframeExecutionGate";
import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  resolveCreativeFfmpegPath,
} from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import {
  creativeStorageUri,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.shot-continuation-execution-gate.v1",
);
const HANDOFF_CONTRACT = "CREATIVE_REVIEWED_CLOSING_FRAME_HANDOFF_V1";
const OUTPUT_BUCKET = "creative-assets";
const MAX_SOURCE_BYTES = 250 * 1024 * 1024;

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function outputReference(task = {}) {
  return CreativeGeneratedMediaPerceptualExecutionGate.outputUrl(task.output) || null;
}

function continuationContract(task = {}) {
  return object(
    task.input?.requirements?.shot_continuation ||
    task.input?.provider_parameters?.shot_continuation,
  );
}

async function projectTasks(task = {}) {
  if (!task.organization_id || !task.creative_project_id) {
    throw new Error("CREATIVE_SHOT_CONTINUATION_PROJECT_CONTEXT_REQUIRED");
  }
  return ProductionTaskRuntime.list({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
  });
}

function taskForExecutionNode(tasks = [], nodeId) {
  return list(tasks).find((candidate) =>
    text(candidate.metadata?.execution_node_id) === text(nodeId),
  ) || null;
}

function assertReviewPassed(review = {}) {
  if (!review || review.status !== "COMPLETED") {
    throw new Error("CREATIVE_SHOT_CONTINUATION_REVIEW_NOT_COMPLETED");
  }
  if (
    review.metadata?.automated_perceptual_validation_passed !== true ||
    review.metadata?.generated_media_released_for_downstream !== true ||
    review.review?.approved !== true
  ) {
    throw new Error("CREATIVE_SHOT_CONTINUATION_REVIEW_NOT_APPROVED");
  }
  const evaluated = CreativeGeneratedMediaPerceptualExecutionGate.validation(review);
  if (evaluated.passed !== true) {
    throw new Error("CREATIVE_SHOT_CONTINUATION_REVIEW_FAILED");
  }
  return evaluated;
}

function runClosingFrameExtraction({ inputPath, outputPath }) {
  const ffmpeg = resolveCreativeFfmpegPath({});
  if (!ffmpeg) {
    throw new Error("CREATIVE_SHOT_CONTINUATION_FFMPEG_NOT_CONFIGURED");
  }
  const result = spawnSync(
    ffmpeg,
    [
      "-y",
      "-loglevel", "error",
      "-sseof", "-0.08",
      "-i", inputPath,
      "-frames:v", "1",
      "-q:v", "2",
      outputPath,
    ],
    {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  if (result.error) {
    throw new Error(
      `CREATIVE_SHOT_CONTINUATION_FFMPEG_UNAVAILABLE:${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `CREATIVE_SHOT_CONTINUATION_FRAME_EXTRACTION_FAILED:${text(result.stderr) || result.status}`,
    );
  }
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size <= 0) {
    throw new Error("CREATIVE_SHOT_CONTINUATION_CLOSING_FRAME_EMPTY");
  }
}

function safeSegment(value) {
  return text(value).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 120);
}

async function persistClosingFrame({ task, previousTask, buffer }) {
  const graphId = safeSegment(task.production_graph_id || "graph");
  const shotId = safeSegment(task.shot_id || task.id || "shot");
  const previousId = safeSegment(previousTask.id || "previous");
  const digest = crypto.createHash("sha256").update(buffer).digest("hex");
  const storagePath = [
    task.organization_id,
    "continuity",
    graphId,
    shotId,
    `from-${previousId}-${digest.slice(0, 16)}.jpg`,
  ].join("/");
  const supabase = getServiceSupabase();
  const { error } = await supabase.storage
    .from(OUTPUT_BUCKET)
    .upload(storagePath, buffer, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: true,
    });
  if (error) throw error;
  return {
    reference: creativeStorageUri(OUTPUT_BUCKET, storagePath),
    sha256: digest,
    storage_path: storagePath,
  };
}

async function bindReviewedClosingFrame(task = {}) {
  const contract = continuationContract(task);
  if (contract.contract !== HANDOFF_CONTRACT) return task;
  if (text(task.input?.first_frame)) return task;
  if (text(task.capability).toLowerCase() !== "ai.video.first_last_frame_to_video") {
    throw new Error("CREATIVE_SHOT_CONTINUATION_FLF2V_REQUIRED");
  }

  const tasks = await projectTasks(task);
  const previous = taskForExecutionNode(
    tasks,
    contract.previous_generation_node_id,
  );
  const review = taskForExecutionNode(
    tasks,
    contract.previous_perceptual_review_node_id,
  );
  if (!previous || previous.status !== "COMPLETED") {
    throw new Error("CREATIVE_SHOT_CONTINUATION_PREVIOUS_GENERATION_NOT_COMPLETED");
  }
  if (
    previous.metadata?.automated_perceptual_validation_passed !== true ||
    previous.metadata?.approved_for_downstream_after_perceptual_review !== true
  ) {
    throw new Error("CREATIVE_SHOT_CONTINUATION_PREVIOUS_GENERATION_NOT_RELEASED");
  }
  const reviewEvaluation = assertReviewPassed(review);
  const sourceReference = outputReference(previous);
  if (!sourceReference) {
    throw new Error("CREATIVE_SHOT_CONTINUATION_PREVIOUS_VIDEO_REQUIRED");
  }

  const materialized = await materializeMedia({
    url: sourceReference,
    organization_id: task.organization_id,
    policy: {
      max_bytes: MAX_SOURCE_BYTES,
      timeout_ms: 120_000,
      max_redirects: 5,
    },
  });
  let outputPath = null;
  try {
    outputPath = path.join(
      path.dirname(materialized.file_path),
      `continuation-closing-frame-${safeSegment(task.id)}.jpg`,
    );
    runClosingFrameExtraction({
      inputPath: materialized.file_path,
      outputPath,
    });
    const buffer = fs.readFileSync(outputPath);
    const stored = await persistClosingFrame({
      task,
      previousTask: previous,
      buffer,
    });

    return ProductionTaskRuntime.update(task.id, {
      input: {
        ...object(task.input),
        first_frame: stored.reference,
        source_assets: [
          ...list(task.input?.source_assets).filter((asset) =>
            text(asset?.role) !== "PREVIOUS_REVIEWED_CLOSING_FRAME",
          ),
          {
            url: stored.reference,
            role: "PREVIOUS_REVIEWED_CLOSING_FRAME",
            sha256: stored.sha256,
            source_production_task_id: previous.id,
            source_review_task_id: review.id,
          },
        ],
        provider_parameters: {
          ...object(task.input?.provider_parameters),
          first_frame: stored.reference,
          shot_continuation: {
            ...contract,
            first_frame_bound: true,
            first_frame_storage_reference: stored.reference,
            first_frame_sha256: stored.sha256,
          },
        },
      },
      metadata: {
        ...object(task.metadata),
        shot_continuation_execution_bound: true,
        reviewed_closing_frame_bound: true,
        continuation_first_frame_storage_reference: stored.reference,
        continuation_first_frame_sha256: stored.sha256,
        continuation_previous_task_id: previous.id,
        continuation_review_task_id: review.id,
        continuation_review_score_contract:
          reviewEvaluation.score_contract?.contract || null,
      },
    });
  } finally {
    if (outputPath) fs.rmSync(outputPath, { force: true });
    await materialized.cleanup();
  }
}

function install() {
  if (ProductionTaskRuntime[INSTALL_FLAG]) return;
  const dispatchWithoutContinuation = ProductionTaskRuntime.dispatch.bind(
    ProductionTaskRuntime,
  );
  Object.defineProperty(ProductionTaskRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionTaskRuntime.dispatch = async function dispatchWithShotContinuation(id) {
    let task = await ProductionTaskRuntime.get(id);
    if (!task) throw new Error("Production task not found");
    if (text(task.metadata?.shot_continuation_contract) === HANDOFF_CONTRACT) {
      task = await bindReviewedClosingFrame(task);
    }
    return dispatchWithoutContinuation(task.id);
  };
}

install();

export const CreativeShotContinuationExecutionGate = Object.freeze({
  installed: true,
  bindReviewedClosingFrame,
  contract: HANDOFF_CONTRACT,
});