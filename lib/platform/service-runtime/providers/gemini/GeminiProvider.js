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

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-omni-flash-preview";
const SUPPORTED_MODELS = new Set([DEFAULT_MODEL]);
const SUPPORTED_ASPECT_RATIOS = new Set(["16:9", "9:16"]);
const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILE_ID_PATTERN = /^[a-z0-9-]{1,80}$/i;
const DEFAULT_MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_OUTPUT_BYTES = 128 * 1024 * 1024;

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

function maxOutputBytes() {
  return positiveInteger(
    process.env.GEMINI_PROVIDER_MAX_OUTPUT_BYTES,
    DEFAULT_MAX_OUTPUT_BYTES,
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

function normalizedModel(input = {}) {
  const model = text(input.model || input.generation?.model) || DEFAULT_MODEL;
  if (!SUPPORTED_MODELS.has(model)) {
    throw new Error(`GEMINI_MODEL_NOT_ALLOWED:${model}`);
  }
  return model;
}

function serializedInstruction(input = {}) {
  const instruction = text(input.provider_prompt || input.prompt);
  if (!instruction) {
    throw new Error("GEMINI_PROVIDER_INSTRUCTION_REQUIRED");
  }
  return instruction;
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
  if (!SUPPORTED_ASPECT_RATIOS.has(value)) {
    throw new Error(`GEMINI_ASPECT_RATIO_UNSUPPORTED:${value}`);
  }
  return value;
}

function sourceValues(input = {}) {
  const generation = object(input.generation);
  const providerParameters = object(
    input.provider_parameters || input.providerParameters,
  );
  return [
    input.primary_source_asset_id,
    input.primarySourceAssetId,
    generation.primary_source_asset_id,
    generation.primarySourceAssetId,
    providerParameters.primary_source_asset_id,
    providerParameters.primarySourceAssetId,
    input.source,
    input.prompt_image,
    ...list(input.source_assets),
    ...list(input.selected_assets),
    ...list(input.assets),
  ].filter((value) => value !== undefined && value !== null && value !== "");
}

function primarySourceAssetId(input = {}) {
  const values = sourceValues(input);
  if (!values.length) return null;

  const ids = new Set();
  for (const value of values) {
    if (typeof value !== "string") {
      throw new Error("GEMINI_PRIMARY_SOURCE_ASSET_ID_MUST_BE_STRING");
    }
    const id = text(value);
    if (!id || id === "[object Object]" || !UUID_PATTERN.test(id)) {
      throw new Error("GEMINI_PRIMARY_SOURCE_ASSET_ID_INVALID");
    }
    ids.add(id);
  }

  if (ids.size !== 1) {
    throw new Error("GEMINI_PRIMARY_SOURCE_ASSET_AMBIGUOUS");
  }

  return [...ids][0];
}

async function sourceImagePart(input = {}) {
  const assetId = primarySourceAssetId(input);
  if (!assetId) return null;

  const orgId = organizationId(input);
  const url = await resolveCreativeProviderAssetUrl({
    organization_id: orgId,
    value: assetId,
  });
  if (!url) throw new Error("GEMINI_PRIMARY_SOURCE_URL_REQUIRED");

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
      throw new Error(`GEMINI_PRIMARY_SOURCE_IMAGE_REQUIRED:${mime || "unknown"}`);
    }
    const bytes = await fs.readFile(materialized.file_path);
    if (!bytes.length || bytes.length > maxSourceBytes()) {
      throw new Error("GEMINI_PRIMARY_SOURCE_SIZE_INVALID");
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
  const source = text(value);
  if (!source) return null;
  const match = source.match(/\/files\/([a-z0-9-]+)/i);
  const id = text(match?.[1]);
  return id && FILE_ID_PATTERN.test(id) ? id : null;
}

function normalizedFileId(value) {
  const source = text(value).replace(/^files\//i, "");
  if (!source || !FILE_ID_PATTERN.test(source)) {
    throw new Error("GEMINI_FILE_ID_INVALID");
  }
  return source;
}

function googleError(result = {}, status = null) {
  return text(
    result?.error?.message ||
    result?.message ||
    result?.error ||
    (status ? `Gemini API request failed with status ${status}` : ""),
  ) || "Gemini API request failed";
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
    throw new Error(`GEMINI_API_ERROR:${googleError(result, response.status)}`);
  }
  return result;
}

function trustedGoogleRedirect(value) {
  const parsed = new URL(value);
  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:") {
    throw new Error("GEMINI_DOWNLOAD_REDIRECT_PROTOCOL_INVALID");
  }
  if (!(
    hostname === "generativelanguage.googleapis.com" ||
    hostname.endsWith(".googleapis.com") ||
    hostname.endsWith(".googleusercontent.com")
  )) {
    throw new Error("GEMINI_DOWNLOAD_REDIRECT_HOST_INVALID");
  }
  return parsed;
}

async function downloadGeneratedVideo(fileId, key) {
  let current = new URL(
    `${API_BASE}/files/${encodeURIComponent(fileId)}:download?alt=media`,
  );
  let includeKey = true;

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: includeKey ? { "x-goog-api-key": key } : {},
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) {
        throw new Error("GEMINI_DOWNLOAD_REDIRECT_INVALID");
      }
      current = trustedGoogleRedirect(new URL(location, current).toString());
      includeKey = current.hostname === "generativelanguage.googleapis.com";
      continue;
    }

    if (!response.ok) {
      throw new Error(`GEMINI_DOWNLOAD_FAILED:${response.status}`);
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    const maximum = maxOutputBytes();
    if (contentLength > maximum) {
      throw new Error("GEMINI_OUTPUT_EXCEEDS_MAX_BYTES");
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > maximum) {
      throw new Error("GEMINI_OUTPUT_SIZE_INVALID");
    }

    const mime = text(response.headers.get("content-type")).split(";")[0].toLowerCase();
    if (mime && mime !== "video/mp4") {
      throw new Error(`GEMINI_OUTPUT_MIME_UNSUPPORTED:${mime}`);
    }

    return {
      bytes,
      mime_type: mime || "video/mp4",
    };
  }

  throw new Error("GEMINI_DOWNLOAD_REDIRECT_LIMIT");
}

async function deleteGoogleFile(fileId, key) {
  try {
    await fetch(`${API_BASE}/files/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
      redirect: "error",
      headers: { "x-goog-api-key": key },
    });
  } catch {
    // Google output files expire automatically; cleanup is best-effort only.
  }
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

async function persistVideo({ bytes, mimeType, fileId, input }) {
  const upload = await uploadCreativeAsset({
    file: {
      buffer: bytes,
      name: `gemini-${fileId}.mp4`,
      type: mimeType || "video/mp4",
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

async function persistInlineVideo(content, input, interactionId = null) {
  const data = text(content?.data);
  if (!data) return null;
  const bytes = Buffer.from(data, "base64");
  if (!bytes.length || bytes.length > maxOutputBytes()) {
    throw new Error("GEMINI_INLINE_OUTPUT_SIZE_INVALID");
  }
  const syntheticId = text(interactionId).replace(/[^a-z0-9-]/gi, "-") || "inline";
  return persistVideo({
    bytes,
    mimeType: text(content?.mime_type) || "video/mp4",
    fileId: syntheticId,
    input,
  });
}

export const GeminiProvider = {
  id: "gemini",

  async execute(input = {}) {
    if (text(input.capability) !== "ai.video.generate") {
      throw new Error(`GEMINI_CAPABILITY_NOT_SUPPORTED:${text(input.capability)}`);
    }

    const key = apiKey(input);
    const model = normalizedModel(input);
    const instruction = serializedInstruction(input);
    const source = await sourceImagePart(input);
    const ratio = aspectRatio(input);

    const request = {
      model,
      input: source
        ? [
            {
              type: "image",
              data: source.data,
              mime_type: source.mime_type,
            },
            { type: "text", text: instruction },
          ]
        : instruction,
      response_format: {
        type: "video",
        delivery: "uri",
        ...(ratio ? { aspect_ratio: ratio } : {}),
      },
      generation_config: {
        video_config: {
          task: source ? "image_to_video" : "text_to_video",
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
      throw new Error(`GEMINI_VIDEO_OUTPUT_REQUIRED:${text(result.status) || "unknown"}`);
    }

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
          primary_source_asset_id: source?.asset_id || null,
          source_binding_mode: source ? "EXPLICIT_PRIMARY_SOURCE_ONLY" : "TEXT_TO_VIDEO",
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
        primary_source_asset_id: source?.asset_id || null,
        source_binding_mode: source ? "EXPLICIT_PRIMARY_SOURCE_ONLY" : "TEXT_TO_VIDEO",
        prompt_contract: {
          serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
          serialized_at_execution: true,
          persisted: false,
          submitted_character_count: instruction.length,
        },
      },
    };
  },

  async getStatus(input = {}) {
    const key = apiKey(input);
    const fileId = normalizedFileId(
      input.job_id || input.provider_job_id || input.provider_file_id,
    );
    const model = normalizedModel(input);

    const info = await requestJson(
      `${API_BASE}/files/${encodeURIComponent(fileId)}`,
      key,
      { method: "GET" },
    );
    const state = text(info.state).toUpperCase();

    if (state === "FAILED") {
      return {
        success: false,
        failed: true,
        pending: false,
        provider: "gemini",
        model,
        provider_job_id: fileId,
        provider_status: "failed",
        error: googleError(info.error || info),
      };
    }

    if (state !== "ACTIVE") {
      return {
        success: true,
        failed: false,
        pending: true,
        provider: "gemini",
        model,
        provider_job_id: fileId,
        provider_status: state.toLowerCase() || "processing",
      };
    }

    const downloaded = await downloadGeneratedVideo(fileId, key);
    const stored = await persistVideo({
      bytes: downloaded.bytes,
      mimeType: downloaded.mime_type,
      fileId,
      input,
    });
    await deleteGoogleFile(fileId, key);

    return {
      success: true,
      failed: false,
      pending: false,
      provider: "gemini",
      model,
      provider_job_id: fileId,
      provider_status: "completed",
      output: {
        provider_job_id: fileId,
        status: "completed",
        provider_status: "completed",
        ...stored,
      },
    };
  },
};
