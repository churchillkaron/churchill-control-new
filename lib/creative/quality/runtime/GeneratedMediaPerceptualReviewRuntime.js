import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import * as ProductionTaskRepository
from "@/lib/operations/tasks/repositories/ProductionTaskRepository";

import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function directUrl(value) {
  if (!value) return null;
  if (typeof value === "string") {
    return /^(https?:\/\/|data:image\/|supabase:\/\/|creative-storage:\/\/)/i.test(value)
      ? value
      : null;
  }
  if (typeof value !== "object") return null;
  for (const key of [
    "url",
    "file_url",
    "fileUrl",
    "video_url",
    "videoUrl",
    "image_url",
    "imageUrl",
    "download_url",
    "downloadUrl",
  ]) {
    const candidate = directUrl(value[key]);
    if (candidate) return candidate;
  }
  return null;
}

function generatedOutputUrl(task = {}) {
  const candidates = [
    task.output?.output,
    task.output?.provider_poll?.output,
    task.output?.provider_poll?.output?.output,
    task.output?.provider_submission?.output,
    task.output?.provider_submission?.output?.output,
    task.output?.result,
  ];
  for (const candidate of candidates) {
    const resolved = directUrl(candidate);
    if (resolved) return resolved;
  }
  return null;
}

function isPerceptualReview(task = {}) {
  const contract = text(
    task.metadata?.contract ||
    task.input?.requirements?.contract ||
    task.input?.contract,
  ).toUpperCase();
  const type = text(task.type).toUpperCase();
  const capability = text(
    task.capability || task.service_code || task.service_id,
  ).toLowerCase();

  return (
    contract === "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1" ||
    (
      type === "QUALITY_REVIEW" &&
      capability === "ai.image.analyze" &&
      Boolean(
        task.metadata?.source_generation_node_id ||
        task.input?.requirements?.source_generation_node_id ||
        task.input?.source_generation_node_id,
      )
    )
  );
}

async function sourceGenerationTask(task) {
  for (const dependencyId of list(task.depends_on)) {
    const dependency = await ProductionTaskRepository.getById(dependencyId);
    if (dependency?.status === "COMPLETED" && generatedOutputUrl(dependency)) {
      return dependency;
    }
  }

  const sourceNodeId = text(
    task.metadata?.source_generation_node_id ||
    task.input?.requirements?.source_generation_node_id ||
    task.input?.source_generation_node_id,
  );
  if (!sourceNodeId) return null;

  const candidates = await ProductionTaskRepository.listByProject({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
    production_graph_id: task.production_graph_id,
    shot_id: task.shot_id || null,
  });

  return candidates.find((candidate) =>
    candidate.status === "COMPLETED" &&
    (
      text(candidate.metadata?.execution_node_id) === sourceNodeId ||
      text(candidate.metadata?.production_node_id) === sourceNodeId ||
      text(candidate.shot_id) === sourceNodeId
    ) &&
    generatedOutputUrl(candidate)
  ) || null;
}

function run(command, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        reject(new Error("PERCEPTUAL_REVIEW_FRAME_EXTRACTION_TIMEOUT"));
      }
    }, timeoutMs);

    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(
          `PERCEPTUAL_REVIEW_FRAME_EXTRACTION_FAILED:${code}:` +
          Buffer.concat(stderr).toString("utf8").replace(/\s+/g, " ").slice(0, 1000),
        ));
        return;
      }
      resolve();
    });
  });
}

async function extractVideoFrames(filePath) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "avantiqo-perceptual-review-"),
  );
  const pattern = path.join(directory, "frame-%02d.jpg");
  const ffmpeg =
    process.env.CREATIVE_MEDIA_FFMPEG_PATH ||
    process.env.FFMPEG_PATH ||
    "ffmpeg";

  try {
    await run(ffmpeg, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      filePath,
      "-vf",
      "fps=1",
      "-frames:v",
      "6",
      "-q:v",
      "3",
      pattern,
    ]);

    const names = (await fs.readdir(directory))
      .filter((name) => /^frame-\d+\.jpg$/i.test(name))
      .sort();
    if (!names.length) {
      throw new Error("PERCEPTUAL_REVIEW_VIDEO_FRAMES_REQUIRED");
    }

    const dataUrls = [];
    for (const name of names) {
      const bytes = await fs.readFile(path.join(directory, name));
      dataUrls.push(`data:image/jpeg;base64,${bytes.toString("base64")}`);
    }
    return {
      frames: dataUrls,
      async cleanup() {
        await fs.rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true });
    throw error;
  }
}

function reviewPrompt(task, sourceTask, frameCount) {
  const requirements = object(task.input?.requirements);
  const expected = object(
    requirements.expected_contract ||
    task.input?.expected_contract ||
    task.metadata?.expected_contract,
  );
  const thresholds = object(
    requirements.thresholds ||
    task.input?.provider_parameters?.thresholds ||
    task.metadata?.thresholds,
  );

  return [
    "You are the deterministic generated-media perceptual quality gate for a professional creative production system.",
    `Review ${frameCount} chronologically ordered representative frames extracted from the completed generated video task ${sourceTask.id}.`,
    "Judge only evidence visible in the supplied frames. Do not invent audio, motion, identity, product, or continuity evidence that the frames cannot establish.",
    "Compare the frames against the immutable expected shot contract and the minimum score thresholds below.",
    "Return one JSON object with: approved (boolean), overall_score (0-100), scores (object using every applicable threshold dimension), issues (array of objects with code, severity, evidence, repair_instruction), summary (string), and evidence_limitations (array).",
    "Set approved=true only when every applicable score meets its threshold and there is no severe anatomy, physics, identity, product, logo, typography, continuity, or synthetic-artifact failure.",
    `EXPECTED_SHOT_CONTRACT=${JSON.stringify(expected)}`,
    `MINIMUM_THRESHOLDS=${JSON.stringify(thresholds)}`,
  ].join("\n\n");
}

async function prepare(task) {
  if (!isPerceptualReview(task)) return null;

  const sourceTask = await sourceGenerationTask(task);
  if (!sourceTask) {
    throw new Error("PERCEPTUAL_REVIEW_COMPLETED_SOURCE_TASK_REQUIRED");
  }

  const sourceUrl = generatedOutputUrl(sourceTask);
  if (!sourceUrl) {
    throw new Error("PERCEPTUAL_REVIEW_GENERATED_OUTPUT_URL_REQUIRED");
  }

  const materialized = await materializeMedia({
    url: sourceUrl,
    organization_id: task.organization_id,
    file_name: `generated-video-${sourceTask.id}.mp4`,
    mime_type: "video/mp4",
    policy: {
      max_bytes: Number(
        process.env.CREATIVE_PERCEPTUAL_REVIEW_MAX_VIDEO_BYTES ||
        process.env.CREATIVE_MEDIA_MAX_INSPECTION_BYTES ||
        200 * 1024 * 1024,
      ),
      timeout_ms: Number(
        process.env.CREATIVE_PERCEPTUAL_REVIEW_DOWNLOAD_TIMEOUT_MS ||
        120000,
      ),
      max_redirects: 3,
    },
  });

  let extracted = null;
  try {
    extracted = await extractVideoFrames(materialized.file_path);
    const frames = extracted.frames;
    const prompt = reviewPrompt(task, sourceTask, frames.length);

    return {
      source_task: sourceTask,
      input: {
        ...(task.input || {}),
        prompt,
        image: frames[0],
        media: frames[0],
        source: frames[0],
        assets: frames.map((url, index) => ({
          url,
          role: "GENERATED_VIDEO_REVIEW_FRAME",
          frame_index: index,
        })),
        reference_images: frames,
        provider_parameters: {
          response_format: { type: "json_object" },
        },
        request_metadata: {
          generated_video_review: "true",
          source_generation_task_id: String(sourceTask.id),
          production_graph_id: String(task.production_graph_id || ""),
          sampled_frame_count: String(frames.length),
        },
      },
      async cleanup() {
        await extracted?.cleanup().catch(() => null);
        await materialized.cleanup().catch(() => null);
      },
    };
  } catch (error) {
    await extracted?.cleanup().catch(() => null);
    await materialized.cleanup().catch(() => null);
    throw error;
  }
}

export const GeneratedMediaPerceptualReviewRuntime = {
  matches: isPerceptualReview,
  prepare,
};
