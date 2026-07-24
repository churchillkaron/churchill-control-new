import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

import {
  CreativeStorageRuntime,
} from "@/lib/creative/storage/runtime/CreativeStorageRuntime";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const MAX_MEDIA_BYTES = 1024 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 120000;

function runFfmpeg(args = []) {
  if (!ffmpegPath) throw new Error("FFMPEG_RUNTIME_UNAVAILABLE");

  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegPath,
      ["-hide_banner", "-loglevel", "error", ...args],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `FFMPEG_REFRAME_FAILED_${code}: ${stderr.slice(-4000)}`,
          ),
        );
      }
    });
  });
}

async function download(url, target) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error("REFRAME_MEDIA_HTTPS_REQUIRED");
  }

  const response = await fetch(parsed, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`REFRAME_MEDIA_DOWNLOAD_FAILED_${response.status}`);
  }

  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_MEDIA_BYTES) {
    throw new Error("REFRAME_MEDIA_TOO_LARGE");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_MEDIA_BYTES) {
    throw new Error("REFRAME_MEDIA_TOO_LARGE");
  }

  await writeFile(target, buffer);
}

async function withWorkspace(operation) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "avantiqo-reframe-"),
  );

  try {
    return await operation(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    const match = String(value).match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function clamp01(value, fallback = 0.5) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function fallbackFocus(item = {}) {
  const position = String(
    item.camera?.subject_position ||
    item.camera?.composition ||
    item.continuity?.subject_position ||
    "",
  ).toLowerCase();

  const focusX = position.includes("left")
    ? 0.32
    : position.includes("right")
      ? 0.68
      : 0.5;
  const focusY = position.includes("top")
    ? 0.35
    : position.includes("low") || position.includes("bottom")
      ? 0.65
      : 0.48;

  return {
    focus_x: focusX,
    focus_y: focusY,
    confidence: 0,
    priority_subjects: [],
    safe_box: null,
    reason: "DIRECTOR_METADATA_FALLBACK",
  };
}

function normalizeFocus(source = {}, fallback = {}) {
  return {
    focus_x: clamp01(source.focus_x, fallback.focus_x ?? 0.5),
    focus_y: clamp01(source.focus_y, fallback.focus_y ?? 0.5),
    confidence: clamp01(source.confidence, 0),
    priority_subjects: Array.isArray(source.priority_subjects)
      ? source.priority_subjects.filter(Boolean)
      : [],
    safe_box: source.safe_box || null,
    protected_elements: Array.isArray(source.protected_elements)
      ? source.protected_elements.filter(Boolean)
      : [],
    crop_risks: Array.isArray(source.crop_risks)
      ? source.crop_risks.filter(Boolean)
      : [],
    reason: source.reason || source.reasoning_summary || "AI_VISUAL_FOCUS",
  };
}

function dimensions(exportSpec = {}) {
  const parsed = String(exportSpec.resolution || "")
    .match(/^(\d+)x(\d+)$/i);
  if (parsed) {
    return {
      width: Number(parsed[1]),
      height: Number(parsed[2]),
    };
  }

  const defaults = {
    "16:9": { width: 1920, height: 1080 },
    "9:16": { width: 1080, height: 1920 },
    "1:1": { width: 1080, height: 1080 },
    "4:5": { width: 1080, height: 1350 },
  };

  return defaults[exportSpec.aspect_ratio] || defaults["16:9"];
}

function cropExpression(width, height, focus = {}) {
  const x = clamp01(focus.focus_x, 0.5).toFixed(6);
  const y = clamp01(focus.focus_y, 0.5).toFixed(6);

  return [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}:max(0,min(iw-${width},iw*${x}-${width}/2)):max(0,min(ih-${height},ih*${y}-${height}/2))`,
  ].join(",");
}

function transitionDefinition(left = {}, right = {}) {
  const source =
    String(left?.type || "CUT").toUpperCase() !== "CUT"
      ? left
      : right;
  const type = String(source?.type || "CUT").toUpperCase();
  const map = {
    DISSOLVE: "fade",
    CROSS_DISSOLVE: "fade",
    FADE: "fade",
    FADE_BLACK: "fadeblack",
    FADE_WHITE: "fadewhite",
    WIPE_LEFT: "wipeleft",
    WIPE_RIGHT: "wiperight",
    WIPE_UP: "wipeup",
    WIPE_DOWN: "wipedown",
    SLIDE_LEFT: "slideleft",
    SLIDE_RIGHT: "slideright",
    SLIDE_UP: "slideup",
    SLIDE_DOWN: "slidedown",
    CIRCLE_OPEN: "circleopen",
    CIRCLE_CLOSE: "circleclose",
    PIXELIZE: "pixelize",
  };

  if (type === "CUT" || !map[type]) {
    return { type: "CUT", ffmpeg: null, duration_seconds: 0 };
  }

  return {
    type,
    ffmpeg: map[type],
    duration_seconds: Math.max(
      0.1,
      Math.min(2, Number(source.duration_seconds || source.duration || 0.5)),
    ),
  };
}

async function analyzeFocus({
  organization_id,
  creative_project_id,
  item,
  aspect_ratio,
  frameBuffer,
}) {
  const fallback = fallbackFocus(item);
  const suffix = String(aspect_ratio).replace(":", "x");
  const evidence = await CreativeStorageRuntime.uploadBuffer({
    organization_id,
    creative_project_id,
    asset_id: `reframe-${item.shot_id || item.index}-${suffix}`,
    filename: "focus-evidence.jpg",
    buffer: frameBuffer,
    content_type: "image/jpeg",
  });

  try {
    const execution = await ServiceExecutionRuntime.execute({
      organization_id,
      service_id: "ai.image.analyze",
      operation: "CREATIVE_CHANNEL_REFRAME_ANALYSIS",
      input: {
        image: evidence.public_url,
        mode: "creative_channel_reframe_analysis",
        prompt: `
Act as a senior commercial-film reframing editor.
The supplied image is a representative frame from one approved shot.
Choose the narrative focus point for a ${aspect_ratio} channel crop while protecting faces, products, readable brand marks, hand actions, sight lines, important environment details and intentional negative space.

SHOT DIRECTION:
${JSON.stringify({
  title: item.title || null,
  camera: item.camera || {},
  continuity: item.continuity || {},
  quality_review: item.quality_review || null,
})}

Return strict JSON only:
{
  "focus_x": number from 0 to 1,
  "focus_y": number from 0 to 1,
  "confidence": number from 0 to 1,
  "priority_subjects": ["string"],
  "protected_elements": ["string"],
  "crop_risks": ["string"],
  "safe_box": {
    "left": number from 0 to 1,
    "top": number from 0 to 1,
    "right": number from 0 to 1,
    "bottom": number from 0 to 1
  },
  "reason": "brief factual explanation"
}
        `.trim(),
      },
      metadata: {
        module: "CREATIVE",
        creative_project_id,
        shot_id: item.shot_id || null,
        aspect_ratio,
        production_contract: "subject_aware_channel_reframe_v1",
      },
      category: "AI",
    });
    const output = execution?.output?.output || execution?.output || {};
    const parsed = parseJson(output.json || output.text || output.output?.text);

    return {
      ...normalizeFocus(parsed || {}, fallback),
      evidence_url: evidence.public_url,
      evidence_storage_path: evidence.storage_path,
      analysis_provider: execution.provider || null,
      analysis_model: execution.model || null,
    };
  } catch (error) {
    return {
      ...fallback,
      evidence_url: evidence.public_url,
      evidence_storage_path: evidence.storage_path,
      analysis_error: error?.message || String(error),
    };
  }
}

async function extractRepresentativeFrame({
  input,
  output,
  sourceIn,
  duration,
}) {
  const frameTime = Math.max(0, sourceIn + Math.max(0.05, duration / 2));

  await runFfmpeg([
    "-ss", String(frameTime),
    "-i", input,
    "-frames:v", "1",
    "-vf", "scale=1280:-2",
    "-q:v", "2",
    output,
  ]);

  return readFile(output);
}

export const CreativeChannelReframingRuntime = {
  async render({
    organization_id,
    creative_project_id,
    edit_decision_list = [],
    export_spec = {},
    fps = 30,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    if (!edit_decision_list.length) {
      throw new Error("EDIT_DECISION_LIST_EMPTY");
    }

    const { width, height } = dimensions(export_spec);
    const aspectRatio = export_spec.aspect_ratio || "16:9";

    return withWorkspace(async (directory) => {
      const normalized = [];
      const durations = [];
      const focusPlan = [];

      for (let index = 0; index < edit_decision_list.length; index += 1) {
        const item = edit_decision_list[index];
        if (!item.source_url) {
          throw new Error(`CLIP_SOURCE_MISSING_${item.shot_id || index}`);
        }

        const input = path.join(directory, `source-${index}.mp4`);
        const frame = path.join(directory, `focus-${index}.jpg`);
        const output = path.join(directory, `reframed-${index}.mp4`);
        await download(item.source_url, input);

        const duration = Math.max(0.25, Number(item.duration_seconds || 0));
        const sourceIn = Math.max(0, Number(item.source_in_seconds || 0));
        const frameBuffer = await extractRepresentativeFrame({
          input,
          output: frame,
          sourceIn,
          duration,
        });
        const focus = await analyzeFocus({
          organization_id,
          creative_project_id,
          item: { ...item, index },
          aspect_ratio: aspectRatio,
          frameBuffer,
        });

        await runFfmpeg([
          "-ss", String(sourceIn),
          "-i", input,
          "-t", String(duration),
          "-vf",
          `${cropExpression(width, height, focus)},fps=${fps},format=yuv420p`,
          "-an",
          "-c:v", "libx264",
          "-preset", "medium",
          "-crf", "18",
          "-movflags", "+faststart",
          output,
        ]);

        normalized.push(output);
        durations.push(duration);
        focusPlan.push({
          index,
          scene_id: item.scene_id || null,
          shot_id: item.shot_id || null,
          source_task_id: item.source_task_id || null,
          aspect_ratio: aspectRatio,
          ...focus,
        });
      }

      const finalPath = path.join(
        directory,
        `reframed-${aspectRatio.replace(":", "x")}.mp4`,
      );
      const inputs = normalized.flatMap((file) => ["-i", file]);
      const filters = normalized.map(
        (_, index) => `[${index}:v]setpts=PTS-STARTPTS[v${index}src]`,
      );
      const transitions = [];
      let current = "[v0src]";
      let accumulatedDuration = durations[0];

      for (let index = 1; index < normalized.length; index += 1) {
        const transition = transitionDefinition(
          edit_decision_list[index - 1]?.transition_out,
          edit_decision_list[index]?.transition_in,
        );
        const next = `[v${index}src]`;
        const output = `[v${index}out]`;

        if (transition.type === "CUT") {
          filters.push(`${current}${next}concat=n=2:v=1:a=0${output}`);
          accumulatedDuration += durations[index];
        } else {
          const maximumDuration = Math.max(
            0.1,
            Math.min(durations[index - 1], durations[index]) * 0.45,
          );
          const transitionDuration = Math.min(
            transition.duration_seconds,
            maximumDuration,
          );
          const offset = Math.max(0, accumulatedDuration - transitionDuration);
          filters.push(
            `${current}${next}xfade=transition=${transition.ffmpeg}:duration=${transitionDuration}:offset=${offset}${output}`,
          );
          accumulatedDuration += durations[index] - transitionDuration;
          transitions.push({
            index,
            type: transition.type,
            duration_seconds: transitionDuration,
            offset_seconds: offset,
          });
        }

        current = output;
      }

      await runFfmpeg([
        ...inputs,
        "-filter_complex", filters.join(";"),
        "-map", current,
        "-an",
        "-c:v", "libx264",
        "-preset", "slow",
        "-crf", "17",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        finalPath,
      ]);

      return {
        buffer: await readFile(finalPath),
        content_type: "video/mp4",
        filename: `subject-aware-${aspectRatio.replace(":", "x")}.mp4`,
        width,
        height,
        fps,
        aspect_ratio: aspectRatio,
        duration_seconds: accumulatedDuration,
        focus_plan: focusPlan,
        transitions_applied: transitions,
        transition_count: transitions.length,
        reframing_contract: "subject_aware_channel_reframe_v1",
      };
    });
  },
};
