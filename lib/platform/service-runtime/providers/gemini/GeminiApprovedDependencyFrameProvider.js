import fs from "node:fs/promises";

import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  uploadCreativeAsset,
} from "@/lib/creative/assets/storage/uploadCreativeAsset";
import {
  GeminiProvider,
} from "./GeminiProvider.js";
import {
  GeminiScopedReferenceProvider,
} from "./GeminiScopedReferenceProvider.js";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-omni-flash-preview";
const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const DEFAULT_MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 128 * 1024 * 1024;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function maxSourceBytes() {
  return positiveInteger(
    process.env.GEMINI_PROVIDER_MAX_SOURCE_BYTES,
    DEFAULT_MAX_SOURCE_BYTES,
  );
}

function apiKey(input = {}) {
  const key = text(input.api_key || input.credential?.api_key);
  if (!key) throw new Error("GEMINI_API_KEY_REQUIRED");
  return key;
}

function organizationId(input = {}) {
  const id = text(
    input.context?.organization_id ||
    input.organization_id ||
    input.organizationId,
  );
  if (!id) throw new Error("GEMINI_ORGANIZATION_ID_REQUIRED");
  return id;
}

function creativeProjectId(input = {}) {
  return text(
    input.creative_project_id ||
    input.creativeProjectId ||
    input.metadata?.creative_project_id,
  ) || null;
}

function creativeMissionId(input = {}) {
  return text(
    input.creative_mission_id ||
    input.creativeMissionId ||
    input.metadata?.creative_mission_id,
  ) || null;
}

function approvedFrame(input = {}) {
  const generationParameters = object(input.generation?.provider_parameters);
  const providerParameters = object(
    input.provider_parameters || input.providerParameters,
  );

  const visualApproved =
    providerParameters.visual_derived_frame_approved === true ||
    generationParameters.visual_derived_frame_approved === true;
  const identityApproved =
    providerParameters.identity_keyframe_approved === true ||
    generationParameters.identity_keyframe_approved === true;

  const visualUrl = text(
    providerParameters.visual_derived_frame_url ||
    generationParameters.visual_derived_frame_url,
  );
  const identityUrl = text(
    providerParameters.identity_keyframe_url ||
    generationParameters.identity_keyframe_url ||
    input.identity_lock?.approved_keyframe_url ||
    input.generation?.identity_lock?.approved_keyframe_url,
  );

  if (visualApproved && visualUrl) {
    return {
      url: visualUrl,
      kind: "VISUAL_DERIVED_FRAME",
      node_id: text(
        providerParameters.visual_derived_frame_node_id ||
        generationParameters.visual_derived_frame_node_id,
      ) || null,
      review_task_id: text(
        providerParameters.visual_derived_frame_review_task_id ||
        generationParameters.visual_derived_frame_review_task_id,
      ) || null,
    };
  }

  if (identityApproved && identityUrl) {
    return {
      url: identityUrl,
      kind: "IDENTITY_STORY_KEYFRAME",
      node_id: text(
        providerParameters.identity_keyframe_node_id ||
        generationParameters.identity_keyframe_node_id,
      ) || null,
      review_task_id: text(
        providerParameters.identity_keyframe_review_task_id ||
        generationParameters.identity_keyframe_review_task_id,
      ) || null,
    };
  }

  return null;
}

function assertBoundFrame(input = {}, frame = {}) {
  const supplied = [
    input.image,
    input.source,
    input.prompt_image,
  ].map(text).filter(Boolean);

  if (!frame.url || !/^(storage|https?):\/\//i.test(frame.url)) {
    throw new Error("GEMINI_APPROVED_DEPENDENCY_FRAME_URL_INVALID");
  }
  if (supplied.length && supplied.some((value) => value !== frame.url)) {
    throw new Error("GEMINI_APPROVED_DEPENDENCY_FRAME_BINDING_MISMATCH");
  }
  if (!frame.review_task_id) {
    throw new Error("GEMINI_APPROVED_DEPENDENCY_FRAME_REVIEW_REQUIRED");
  }
}

function instruction(input = {}) {
  const value = text(input.provider_prompt || input.prompt);
  if (!value) throw new Error("GEMINI_PROVIDER_INSTRUCTION_REQUIRED");
  return value;
}

function durationSeconds(input = {}) {
  const outputSpec = object(input.output_spec || input.outputSpec);
  const generationOutput = object(
    input.generation?.output_spec || input.generation?.outputSpec,
  );
  const value = Number(
    input.media_duration_seconds ??
    input.mediaDurationSeconds ??
    outputSpec.duration_seconds ??
    outputSpec.durationSeconds ??
    generationOutput.duration_seconds ??
    generationOutput.durationSeconds ??
    input.generation?.estimated_seconds ??
    input.quantity,
  );
  if (!Number.isInteger(value) || value < 3 || value > 10) {
    throw new Error(
      `GEMINI_VIDEO_DURATION_UNSUPPORTED:${Number.isFinite(value) ? value : "missing"}`,
    );
  }
  return value;
}

function aspectRatio(input = {}) {
  const outputSpec = object(input.output_spec || input.outputSpec);
  const generationOutput = object(
    input.generation?.output_spec || input.generation?.outputSpec,
  );
  const providerParameters = object(
    input.provider_parameters || input.providerParameters,
  );
  const value = text(
    outputSpec.aspect_ratio ||
    outputSpec.aspectRatio ||
    generationOutput.aspect_ratio ||
    generationOutput.aspectRatio ||
    providerParameters.aspect_ratio ||
    providerParameters.aspectRatio,
  );
  if (!value) return null;
  if (!["16:9", "9:16"].includes(value)) {
    throw new Error(`GEMINI_ASPECT_RATIO_UNSUPPORTED:${value}`);
  }
  return value;
}

async function frameImagePart(input = {}, frame = {}) {
  const materialized = await materializeMedia({
    url: frame.url,
    organization_id: organizationId(input),
    policy: {
      max_bytes: maxSourceBytes(),
      timeout_ms: 30000,
      max_redirects: 1,
    },
  });

  try {
    const mime = text(materialized.mime_type).toLowerCase();
    if (!IMAGE_MIME_TYPES.has(mime)) {
      throw new Error(
        `GEMINI_APPROVED_DEPENDENCY_FRAME_IMAGE_REQUIRED:${mime || "unknown"}`,
      );
    }
    const bytes = await fs.readFile(materialized.file_path);
    if (!bytes.length || bytes.length > maxSourceBytes()) {
      throw new Error("GEMINI_APPROVED_DEPENDENCY_FRAME_SIZE_INVALID");
    }
    return {
      type: "image",
      data: bytes.toString("base64"),
      mime_type: mime,
    };
  } finally {
    await materialized.cleanup();
  }
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    ...options,
    redirect: "error",
    headers: {
      "x-goog-api-key": key,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const raw = await response.text();
  let result = {};
  if (raw) {
    try {
      result = JSON.parse(raw);
    } catch {
      result = {};
    }
  }
  if (!response.ok) {
    const message = text(
      result?.error?.message ||
      result?.message ||
      result?.error,
    );
    throw new Error(
      `GEMINI_API_ERROR:${message || `Gemini API request failed with status ${response.status}`}`,
    );
  }
  return result;
}

function videoContent(result = {}) {
  if (result.output_video && typeof result.output_video === "object") {
    return result.output_video;
  }
  for (const step of Array.isArray(result.steps) ? result.steps : []) {
    if (text(step?.type).toLowerCase() !== "model_output") continue;
    for (const content of Array.isArray(step?.content) ? step.content : []) {
      if (text(content?.type).toLowerCase() === "video") return content;
    }
  }
  return null;
}

function fileIdFromUri(value) {
  const match = text(value).match(/\/files\/([a-z0-9-]+)/i);
  return text(match?.[1]) || null;
}

async function persistInlineVideo(content, input, interactionId = null) {
  const data = text(content?.data);
  if (!data) return null;
  const bytes = Buffer.from(data, "base64");
  if (!bytes.length || bytes.length > MAX_OUTPUT_BYTES) {
    throw new Error("GEMINI_INLINE_OUTPUT_SIZE_INVALID");
  }
  const syntheticId = text(interactionId).replace(/[^a-z0-9-]/gi, "-") || "inline";
  const upload = await uploadCreativeAsset({
    file: {
      buffer: bytes,
      name: `gemini-${syntheticId}.mp4`,
      type: text(content?.mime_type) || "video/mp4",
    },
    organizationId: organizationId(input),
    creativeMissionId: creativeMissionId(input),
    creativeProjectId: creativeProjectId(input),
    uploadedBy: null,
  });
  return {
    video_url: upload.file_url,
    file_url: upload.file_url,
    storage_reference: upload.file_url,
    storage_bucket: upload.bucket,
    storage_path: upload.path,
    signed_url_required: true,
    mime_type: upload.mime_type,
    media_kind: upload.media_kind,
    size_bytes: upload.size_bytes,
    checksum_sha256: upload.checksum_sha256,
  };
}

async function executeApprovedFrameToVideo(input = {}, frame = {}) {
  assertBoundFrame(input, frame);

  if (text(input.capability) !== "ai.video.generate") {
    throw new Error(`GEMINI_CAPABILITY_NOT_SUPPORTED:${text(input.capability)}`);
  }

  const model = text(input.model || input.generation?.model) || DEFAULT_MODEL;
  if (model !== DEFAULT_MODEL) {
    throw new Error(`GEMINI_APPROVED_DEPENDENCY_FRAME_MODEL_NOT_ALLOWED:${model}`);
  }

  const key = apiKey(input);
  const image = await frameImagePart(input, frame);
  const duration = durationSeconds(input);
  const ratio = aspectRatio(input);
  const serialized = instruction(input);
  const request = {
    model,
    input: [
      {
        type: "image",
        data: image.data,
        mime_type: image.mime_type,
      },
      {
        type: "text",
        text: [
          "APPROVED DEPENDENCY FRAME CONTRACT",
          `The supplied image is the reviewed ${frame.kind} and is the exact approved visual starting frame for this shot.`,
          "Preserve the approved frame's identity, geometry, brand details, products, materials and scene truth unless the immutable shot direction explicitly changes state through motion.",
          serialized,
        ].join("\n\n"),
      },
    ],
    response_format: {
      type: "video",
      delivery: "uri",
      duration: `${duration}s`,
      ...(ratio ? { aspect_ratio: ratio } : {}),
    },
    generation_config: {
      video_config: {
        task: "image_to_video",
      },
    },
  };

  const result = await requestJson(`${API_BASE}/interactions`, key, {
    method: "POST",
    body: JSON.stringify(request),
  });
  const content = videoContent(result);
  const interactionId = text(result.id) || null;
  if (!content) {
    throw new Error(
      `GEMINI_VIDEO_OUTPUT_REQUIRED:${text(result.status) || "unknown"}`,
    );
  }

  const provenance = {
    approved_dependency_frame: true,
    approved_dependency_frame_kind: frame.kind,
    approved_dependency_frame_node_id: frame.node_id,
    approved_dependency_frame_review_task_id: frame.review_task_id,
    visual_input_mode: "APPROVED_DEPENDENCY_FRAME",
  };

  if (content.data) {
    const stored = await persistInlineVideo(content, input, interactionId);
    return {
      success: true,
      provider: "gemini",
      model,
      output: {
        provider_job_id: null,
        status: "completed",
        provider_status: "completed",
        interaction_id: interactionId,
        requested_duration_seconds: duration,
        ...provenance,
        ...stored,
      },
    };
  }

  const fileId = fileIdFromUri(content.uri);
  if (!fileId) throw new Error("GEMINI_VIDEO_FILE_ID_REQUIRED");
  return {
    success: true,
    provider: "gemini",
    model,
    output: {
      provider_job_id: fileId,
      provider_file_id: fileId,
      status: "processing",
      provider_status: "processing",
      interaction_id: interactionId,
      requested_duration_seconds: duration,
      ...provenance,
      prompt_contract: {
        serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
        serialized_at_execution: true,
        persisted: false,
        submitted_character_count: serialized.length,
      },
    },
  };
}

export const GeminiApprovedDependencyFrameProvider = Object.freeze({
  id: "gemini",

  async execute(input = {}) {
    const frame = approvedFrame(input);
    if (frame) return executeApprovedFrameToVideo(input, frame);
    return GeminiScopedReferenceProvider.execute(input);
  },

  getStatus(input = {}) {
    return GeminiProvider.getStatus(input);
  },
});
