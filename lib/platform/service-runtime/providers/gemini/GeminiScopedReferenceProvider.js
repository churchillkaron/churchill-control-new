import fs from "node:fs/promises";

import {
  resolveCreativeProviderAssetUrl,
} from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  uploadCreativeAsset,
} from "@/lib/creative/assets/storage/uploadCreativeAsset";
import {
  GeminiProvider,
} from "./GeminiProvider.js";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-omni-flash-preview";
const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_REFERENCE_IMAGES = 4;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.flat(Infinity).filter(Boolean) : [];
}

function unique(values = []) {
  return [...new Set(list(values).map((value) => text(
    value?.asset_id || value?.assetId || value?.id || value,
  )).filter(Boolean))];
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

function maxReferenceImages() {
  return positiveInteger(
    process.env.GEMINI_PROVIDER_MAX_REFERENCE_IMAGES,
    DEFAULT_MAX_REFERENCE_IMAGES,
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

function model(input = {}) {
  return text(input.model || input.generation?.model) || DEFAULT_MODEL;
}

function serializedInstruction(input = {}) {
  const instruction = text(input.provider_prompt || input.prompt);
  if (!instruction) throw new Error("GEMINI_PROVIDER_INSTRUCTION_REQUIRED");
  return instruction;
}

function primarySourceAssetId(input = {}) {
  const generation = object(input.generation);
  const providerParameters = object(
    input.provider_parameters || input.providerParameters,
  );
  const candidates = unique([
    input.primary_source_asset_id,
    input.primarySourceAssetId,
    generation.primary_source_asset_id,
    generation.primarySourceAssetId,
    providerParameters.primary_source_asset_id,
    providerParameters.primarySourceAssetId,
    input.source,
    input.prompt_image,
    list(input.source_assets)[0],
    list(input.selected_assets)[0],
    list(input.assets)[0],
  ]);

  if (!candidates.length) return null;
  if (candidates.length !== 1) {
    throw new Error(`GEMINI_PRIMARY_SOURCE_ASSET_AMBIGUOUS:${candidates.join(",")}`);
  }
  if (!UUID_PATTERN.test(candidates[0])) {
    throw new Error("GEMINI_PRIMARY_SOURCE_ASSET_ID_INVALID");
  }
  return candidates[0];
}

function explicitReferenceAssetIds(input = {}) {
  const requirements = object(input.requirements);
  const generation = object(input.generation);
  const providerParameters = object(
    input.provider_parameters || input.providerParameters,
  );
  return unique([
    input.reference_asset_ids,
    input.reference_assets,
    requirements.reference_asset_ids,
    requirements.reference_assets,
    generation.reference_asset_ids,
    generation.reference_assets,
    generation.provider_parameters?.reference_asset_ids,
    providerParameters.reference_asset_ids,
  ]);
}

function scopedReferenceAssetIds(input = {}, primary = null) {
  const requirements = object(input.requirements);
  const scope = object(requirements.asset_scope || input.asset_scope);
  const scoped = new Set(unique(scope.creative_asset_ids));
  const references = explicitReferenceAssetIds(input)
    .filter((id) => id !== primary);

  if (!references.length) return [];
  if (!scope.scope_hash || !scoped.size) {
    throw new Error("GEMINI_REFERENCE_ASSET_SCOPE_REQUIRED");
  }

  const unauthorized = references.filter((id) => !scoped.has(id));
  if (unauthorized.length) {
    throw new Error(
      `GEMINI_REFERENCE_ASSET_NOT_SCOPED:${unauthorized.join(",")}`,
    );
  }
  if (references.some((id) => !UUID_PATTERN.test(id))) {
    throw new Error("GEMINI_REFERENCE_ASSET_ID_INVALID");
  }
  if (references.length > maxReferenceImages()) {
    throw new Error(
      `GEMINI_REFERENCE_IMAGE_LIMIT_EXCEEDED:${references.length}:${maxReferenceImages()}`,
    );
  }
  return references;
}

async function imagePart(assetId, input = {}) {
  const orgId = organizationId(input);
  const url = await resolveCreativeProviderAssetUrl({
    organization_id: orgId,
    value: assetId,
  });
  if (!url) throw new Error(`GEMINI_REFERENCE_URL_REQUIRED:${assetId}`);

  const materialized = await materializeMedia({
    url,
    organization_id: orgId,
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
        `GEMINI_REFERENCE_IMAGE_REQUIRED:${assetId}:${mime || "unknown"}`,
      );
    }
    const bytes = await fs.readFile(materialized.file_path);
    if (!bytes.length || bytes.length > maxSourceBytes()) {
      throw new Error(`GEMINI_REFERENCE_IMAGE_SIZE_INVALID:${assetId}`);
    }
    return {
      type: "image",
      data: bytes.toString("base64"),
      mime_type: mime,
      asset_id: assetId,
    };
  } finally {
    await materialized.cleanup();
  }
}

function durationSeconds(input = {}) {
  const outputSpec = object(input.output_spec || input.outputSpec);
  const generation = object(input.generation);
  const generationOutput = object(
    generation.output_spec || generation.outputSpec,
  );
  const value = Number(
    input.media_duration_seconds ??
    input.mediaDurationSeconds ??
    outputSpec.duration_seconds ??
    outputSpec.durationSeconds ??
    generationOutput.duration_seconds ??
    generationOutput.durationSeconds ??
    generation.estimated_seconds ??
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
  const generation = object(input.generation);
  const generationOutput = object(
    generation.output_spec || generation.outputSpec,
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

function videoContent(result = {}) {
  if (result.output_video && typeof result.output_video === "object") {
    return result.output_video;
  }
  for (const step of list(result.steps)) {
    if (text(step?.type).toLowerCase() !== "model_output") continue;
    for (const content of list(step?.content)) {
      if (text(content?.type).toLowerCase() === "video") return content;
    }
  }
  return null;
}

function fileIdFromUri(value) {
  const match = text(value).match(/\/files\/([a-z0-9-]+)/i);
  return text(match?.[1]) || null;
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
    const message = text(result?.error?.message || result?.message || result?.error);
    throw new Error(
      `GEMINI_API_ERROR:${message || `Gemini API request failed with status ${response.status}`}`,
    );
  }
  return result;
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

async function persistInlineVideo(content, input, interactionId = null) {
  const data = text(content?.data);
  if (!data) return null;
  const bytes = Buffer.from(data, "base64");
  if (!bytes.length) throw new Error("GEMINI_INLINE_OUTPUT_SIZE_INVALID");
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

function instructionForReferencePack(instruction, primary, references) {
  return [
    "SCOPED REFERENCE CONTRACT",
    `Image 1 is the immutable primary source asset ${primary}.`,
    ...references.map((id, index) =>
      `Image ${index + 2} is an explicitly scoped supporting reference asset ${id}.`,
    ),
    "Use supporting references only for the structured identity, product, brand, location, material, or continuity evidence requested by the shot contract. Do not merge subjects, invent extra people, copy unrelated backgrounds, or replace the primary source identity/location unless the shot contract explicitly requires it.",
    instruction,
  ].join("\n\n");
}

async function executeScopedReferenceToVideo(input = {}) {
  const primary = primarySourceAssetId(input);
  if (!primary) return GeminiProvider.execute(input);

  const references = scopedReferenceAssetIds(input, primary);
  if (!references.length) return GeminiProvider.execute(input);

  const key = apiKey(input);
  const instruction = serializedInstruction(input);
  const duration = durationSeconds(input);
  const ratio = aspectRatio(input);
  const ids = [primary, ...references];
  const images = [];
  for (const id of ids) {
    images.push(await imagePart(id, input));
  }

  const request = {
    model: model(input),
    input: [
      ...images.map((image) => ({
        type: "image",
        data: image.data,
        mime_type: image.mime_type,
      })),
      {
        type: "text",
        text: instructionForReferencePack(instruction, primary, references),
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
        task: "reference_to_video",
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

  const outputBase = {
    interaction_id: interactionId,
    primary_source_asset_id: primary,
    reference_asset_ids: references,
    source_binding_mode: "SCOPED_REFERENCE_TO_VIDEO",
    requested_duration_seconds: duration,
    reference_image_count: references.length,
    prompt_contract: {
      serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
      serialized_at_execution: true,
      persisted: false,
      submitted_character_count: instruction.length,
    },
  };

  if (content.data) {
    const stored = await persistInlineVideo(content, input, interactionId);
    return {
      success: true,
      provider: "gemini",
      model: model(input),
      output: {
        provider_job_id: null,
        status: "completed",
        provider_status: "completed",
        ...outputBase,
        ...stored,
      },
    };
  }

  const fileId = fileIdFromUri(content.uri);
  if (!fileId) throw new Error("GEMINI_VIDEO_FILE_ID_REQUIRED");
  return {
    success: true,
    provider: "gemini",
    model: model(input),
    output: {
      provider_job_id: fileId,
      provider_file_id: fileId,
      status: "processing",
      provider_status: "processing",
      ...outputBase,
    },
  };
}

export const GeminiScopedReferenceProvider = {
  id: "gemini",
  execute: executeScopedReferenceToVideo,
  getStatus(input = {}) {
    return GeminiProvider.getStatus(input);
  },
};
