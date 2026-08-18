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
  getProviderPricing,
} from "@/lib/platform/service-runtime/pricing/repositories/ProviderPricingRepository";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const PROVIDER_ID = "google-veo";
const CONTRACT = "GEMINI_VEO_CONFIGURED_EXECUTION_V2";
const JOB_PREFIX = "gemini-veo:v2:";
const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_VIDEO_BYTES = 128 * 1024 * 1024;
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024 * 1024;

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

function maxImageBytes() {
  return positiveInteger(
    process.env.GEMINI_VEO_MAX_IMAGE_BYTES,
    DEFAULT_MAX_IMAGE_BYTES,
  );
}

function maxVideoBytes() {
  return positiveInteger(
    process.env.GEMINI_VEO_MAX_VIDEO_BYTES,
    DEFAULT_MAX_VIDEO_BYTES,
  );
}

function maxOutputBytes() {
  return positiveInteger(
    process.env.GEMINI_VEO_MAX_OUTPUT_BYTES,
    DEFAULT_MAX_OUTPUT_BYTES,
  );
}

function apiKey(input = {}) {
  const key = text(input.api_key || input.credential?.api_key);
  if (!key) throw new Error("GEMINI_VEO_API_KEY_REQUIRED");
  return key;
}

function organizationId(input = {}) {
  const id = text(
    input.context?.organization_id ||
    input.organization_id ||
    input.organizationId,
  );
  if (!id) throw new Error("GEMINI_VEO_ORGANIZATION_ID_REQUIRED");
  return id;
}

function selectedModel(input = {}) {
  const model = text(input.model || input.generation?.model);
  if (!model) throw new Error("GEMINI_VEO_MODEL_REQUIRED");
  return model;
}

function selectedCapability(input = {}) {
  const capability = text(
    input.capability ||
    input.generation?.capability ||
    input.generation?.service,
  );
  if (!capability) throw new Error("GEMINI_VEO_CAPABILITY_REQUIRED");
  return capability;
}

async function executionConfiguration(input = {}) {
  const model = selectedModel(input);
  const capability = selectedCapability(input);
  const pricing = await getProviderPricing({
    provider: PROVIDER_ID,
    capability,
    model,
    country: input.context?.country || input.country || null,
    currency: input.context?.currency || input.currency || null,
  });
  const profile = object(pricing?.metadata?.video_capabilities);
  if (!pricing || !profile.contract) {
    throw new Error("GEMINI_VEO_ACTIVE_VIDEO_CONFIGURATION_REQUIRED");
  }
  if (text(pricing.model) !== model || text(pricing.capability) !== capability) {
    throw new Error("GEMINI_VEO_CONFIGURATION_SCOPE_MISMATCH");
  }
  return {
    provider: PROVIDER_ID,
    model,
    capability,
    pricing_id: pricing.id,
    profile,
  };
}

function serializedInstruction(input = {}) {
  const instruction = text(input.provider_prompt || input.prompt);
  if (!instruction) {
    throw new Error("GEMINI_VEO_PROVIDER_INSTRUCTION_REQUIRED");
  }
  return instruction;
}

function providerParameters(input = {}) {
  return {
    ...object(input.provider_parameters || input.providerParameters),
    ...object(input.generation?.provider_parameters || input.generation?.providerParameters),
  };
}

function shotBible(input = {}) {
  return object(input.shot_bible || input.shotBible);
}

function precisionControl(input = {}) {
  return object(shotBible(input).precision_control);
}

function frameAssetId(frame = {}) {
  const value = text(frame.asset_id || frame.assetId);
  return value || null;
}

function firstFrameAssetId(input = {}) {
  const params = providerParameters(input);
  const bible = shotBible(input);
  const precision = precisionControl(input);
  const opening = object(bible.frame_plan?.opening_frame || bible.frame_plan?.openingFrame);
  return text(
    precision.opening_frame_asset_id ||
    precision.openingFrameAssetId ||
    params.first_frame_asset_id ||
    params.firstFrameAssetId ||
    frameAssetId(opening),
  ) || null;
}

function lastFrameAssetId(input = {}) {
  const params = providerParameters(input);
  const bible = shotBible(input);
  const precision = precisionControl(input);
  const closing = object(bible.frame_plan?.closing_frame || bible.frame_plan?.closingFrame);
  return text(
    precision.closing_frame_asset_id ||
    precision.closingFrameAssetId ||
    params.last_frame_asset_id ||
    params.lastFrameAssetId ||
    frameAssetId(closing),
  ) || null;
}

function extensionSource(input = {}) {
  const params = providerParameters(input);
  const precision = precisionControl(input);
  return {
    asset_id: text(
      precision.extension_source_asset_id ||
      precision.extensionSourceAssetId ||
      params.extension_source_asset_id ||
      params.extensionSourceAssetId ||
      params.video_extension_source_asset_id ||
      params.videoExtensionSourceAssetId,
    ) || null,
    provider: text(
      precision.extension_source_provider ||
      precision.extensionSourceProvider ||
      params.extension_source_provider ||
      params.extensionSourceProvider,
    ).toLowerCase() || null,
    model: text(
      precision.extension_source_model ||
      precision.extensionSourceModel ||
      params.extension_source_model ||
      params.extensionSourceModel,
    ) || null,
  };
}

function referenceAssetIds(input = {}) {
  const params = providerParameters(input);
  const bible = shotBible(input);
  const precision = precisionControl(input);
  const values = [
    ...list(precision.reference_asset_ids || precision.referenceAssetIds),
    ...list(params.reference_asset_ids || params.referenceAssetIds),
    ...list(bible.source?.reference_asset_ids),
  ]
    .map((value) => typeof value === "string" ? value : value?.asset_id || value?.assetId || value?.id)
    .map(text)
    .filter(Boolean);

  return [...new Set(values)];
}

function requestedDuration(input = {}) {
  const bible = shotBible(input);
  const output = object(bible.output);
  const generation = object(input.generation);
  const generationOutput = object(generation.output_spec || generation.outputSpec);
  const inputOutput = object(input.output_spec || input.outputSpec);
  const value = Number(
    output.duration_seconds ??
    inputOutput.duration_seconds ??
    inputOutput.durationSeconds ??
    generationOutput.duration_seconds ??
    generationOutput.durationSeconds ??
    generation.duration_seconds ??
    generation.estimated_seconds ??
    input.media_duration_seconds ??
    input.quantity,
  );
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("GEMINI_VEO_DURATION_REQUIRED");
  }
  return value;
}

function requestedAspectRatio(input = {}, profile = {}) {
  const bible = shotBible(input);
  const params = providerParameters(input);
  const supported = list(profile.supported_aspect_ratios).map(text).filter(Boolean);
  const value = text(
    bible.output?.aspect_ratio ||
    bible.output?.aspectRatio ||
    params.aspect_ratio ||
    params.aspectRatio ||
    profile.default_aspect_ratio ||
    supported[0],
  );
  if (!value) throw new Error("GEMINI_VEO_ASPECT_RATIO_REQUIRED");
  if (supported.length && !supported.includes(value)) {
    throw new Error(`GEMINI_VEO_ASPECT_RATIO_UNSUPPORTED:${value}`);
  }
  return value;
}

function requestedResolution(input = {}, profile = {}) {
  const bible = shotBible(input);
  const params = providerParameters(input);
  const generation = object(input.generation);
  const generationOutput = object(
    generation.output_spec || generation.outputSpec,
  );
  const inputOutput = object(input.output_spec || input.outputSpec);
  const value = text(
    params.resolution ||
    inputOutput.provider_resolution ||
    inputOutput.resolution ||
    generationOutput.provider_resolution ||
    generationOutput.resolution ||
    bible.output?.provider_resolution ||
    bible.output?.resolution,
  ).toLowerCase();
  if (!value) throw new Error("GEMINI_VEO_RESOLUTION_REQUIRED");
  const supported = list(profile.supported_resolutions)
    .map((item) => text(item).toLowerCase())
    .filter(Boolean);
  if (supported.length && !supported.includes(value)) {
    throw new Error(`GEMINI_VEO_RESOLUTION_UNSUPPORTED:${value}`);
  }
  return value;
}

function allowedDurations(profile = {}, resolution = null) {
  const topLevel = list(profile.allowed_duration_seconds)
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0);
  const specific = list(
    object(object(profile.resolution_constraints)[resolution]).allowed_duration_seconds,
  )
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0);
  return specific.length ? specific : topLevel;
}

function validateDuration(profile = {}, resolution, duration) {
  const allowed = allowedDurations(profile, resolution);
  if (allowed.length && !allowed.includes(duration)) {
    throw new Error(
      `GEMINI_VEO_DURATION_UNSUPPORTED:${resolution}:${duration}`,
    );
  }
  return duration;
}

function validateExtension({ extension, profile, resolution, configuration }) {
  const constraints = object(profile.extension_constraints);
  const supported = list(constraints.supported_resolutions)
    .map((item) => text(item).toLowerCase())
    .filter(Boolean);
  if (supported.length && !supported.includes(resolution)) {
    throw new Error(`GEMINI_VEO_EXTENSION_RESOLUTION_UNSUPPORTED:${resolution}`);
  }
  if (
    constraints.require_same_provider === true &&
    extension.provider !== text(configuration.provider).toLowerCase()
  ) {
    throw new Error("GEMINI_VEO_EXTENSION_SOURCE_PROVIDER_MISMATCH");
  }
  const modelPrefixes = list(constraints.allowed_source_model_prefixes)
    .map(text)
    .filter(Boolean);
  if (
    modelPrefixes.length &&
    !modelPrefixes.some((prefix) => text(extension.model).startsWith(prefix))
  ) {
    throw new Error("GEMINI_VEO_EXTENSION_SOURCE_MODEL_UNSUPPORTED");
  }
}

function validateAssetId(value, label) {
  const id = text(value);
  if (!id || !UUID_PATTERN.test(id)) {
    throw new Error(`GEMINI_VEO_${label}_ASSET_ID_INVALID`);
  }
  return id;
}

async function materializeAsset({ input, assetId, kind }) {
  const id = validateAssetId(assetId, kind === "video" ? "VIDEO" : "IMAGE");
  const orgId = organizationId(input);
  const url = await resolveCreativeProviderAssetUrl({
    organization_id: orgId,
    value: id,
  });
  if (!url) throw new Error("GEMINI_VEO_ASSET_URL_REQUIRED");

  const maximum = kind === "video" ? maxVideoBytes() : maxImageBytes();
  const materialized = await materializeMedia({
    url,
    organization_id: orgId,
    policy: {
      max_bytes: maximum,
      timeout_ms: 30000,
      max_redirects: 1,
    },
  });

  try {
    const mime = text(materialized.mime_type).toLowerCase();
    if (kind === "video") {
      if (mime !== "video/mp4") {
        throw new Error(`GEMINI_VEO_EXTENSION_MP4_REQUIRED:${mime || "unknown"}`);
      }
    } else if (!IMAGE_MIME_TYPES.has(mime)) {
      throw new Error(`GEMINI_VEO_IMAGE_REQUIRED:${mime || "unknown"}`);
    }

    const bytes = await fs.readFile(materialized.file_path);
    if (!bytes.length || bytes.length > maximum) {
      throw new Error("GEMINI_VEO_SOURCE_SIZE_INVALID");
    }

    return {
      asset_id: id,
      inlineData: {
        mimeType: mime,
        data: bytes.toString("base64"),
      },
    };
  } finally {
    await materialized.cleanup();
  }
}

function encodeJob(operationName) {
  const name = text(operationName);
  if (!name || name.includes("..") || !/^[A-Za-z0-9._~/-]+$/.test(name)) {
    throw new Error("GEMINI_VEO_OPERATION_NAME_INVALID");
  }
  return `${JOB_PREFIX}${Buffer.from(name, "utf8").toString("base64url")}`;
}

function decodeJob(jobId) {
  const value = text(jobId);
  if (!value.startsWith(JOB_PREFIX)) {
    throw new Error("GEMINI_VEO_JOB_ID_INVALID");
  }
  let name = "";
  try {
    name = Buffer.from(value.slice(JOB_PREFIX.length), "base64url").toString("utf8");
  } catch {
    throw new Error("GEMINI_VEO_JOB_ID_INVALID");
  }
  if (!name || name.includes("..") || !/^[A-Za-z0-9._~/-]+$/.test(name)) {
    throw new Error("GEMINI_VEO_OPERATION_NAME_INVALID");
  }
  return name;
}

function googleError(result = {}, status = null) {
  return text(
    result?.error?.message ||
    result?.message ||
    result?.error ||
    (status ? `Google Veo API request failed with status ${status}` : ""),
  ) || "Google Veo API request failed";
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
    throw new Error(`GEMINI_VEO_API_ERROR:${googleError(result, response.status)}`);
  }
  return result;
}

function trustedGoogleUrl(value) {
  const parsed = new URL(value);
  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:") {
    throw new Error("GEMINI_VEO_DOWNLOAD_PROTOCOL_INVALID");
  }
  if (!(
    hostname === "generativelanguage.googleapis.com" ||
    hostname.endsWith(".googleapis.com") ||
    hostname.endsWith(".googleusercontent.com")
  )) {
    throw new Error("GEMINI_VEO_DOWNLOAD_HOST_INVALID");
  }
  return parsed;
}

async function downloadVideo(uri, key) {
  let current = trustedGoogleUrl(uri);
  let includeKey = current.hostname.endsWith("googleapis.com");

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: includeKey ? { "x-goog-api-key": key } : {},
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) {
        throw new Error("GEMINI_VEO_DOWNLOAD_REDIRECT_INVALID");
      }
      current = trustedGoogleUrl(new URL(location, current).toString());
      includeKey = current.hostname.endsWith("googleapis.com");
      continue;
    }

    if (!response.ok) {
      throw new Error(`GEMINI_VEO_DOWNLOAD_FAILED:${response.status}`);
    }

    const maximum = maxOutputBytes();
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > maximum) {
      throw new Error("GEMINI_VEO_OUTPUT_EXCEEDS_MAX_BYTES");
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > maximum) {
      throw new Error("GEMINI_VEO_OUTPUT_SIZE_INVALID");
    }
    const mime = text(response.headers.get("content-type")).split(";")[0].toLowerCase();
    if (mime && mime !== "video/mp4") {
      throw new Error(`GEMINI_VEO_OUTPUT_MIME_UNSUPPORTED:${mime}`);
    }
    return {
      bytes,
      mime_type: mime || "video/mp4",
    };
  }

  throw new Error("GEMINI_VEO_DOWNLOAD_REDIRECT_LIMIT");
}

function creativeProjectId(input = {}) {
  return text(
    input.creative_project_id ||
    input.creativeProjectId ||
    input.context?.creative_project_id ||
    input.metadata?.creative_project_id,
  ) || null;
}

function creativeMissionId(input = {}) {
  return text(
    input.creative_mission_id ||
    input.creativeMissionId ||
    input.context?.creative_mission_id ||
    input.metadata?.creative_mission_id,
  ) || null;
}

async function persistVideo({ bytes, mimeType, operationName, input }) {
  const fileId = text(operationName).split("/").pop().replace(/[^a-z0-9-]/gi, "-") || "veo";
  const upload = await uploadCreativeAsset({
    file: {
      buffer: bytes,
      name: `google-veo-${fileId}.mp4`,
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

async function buildRequest(input = {}, configuration) {
  const profile = configuration.profile;
  const precision = precisionControl(input);
  const firstId = firstFrameAssetId(input);
  const lastId = lastFrameAssetId(input);
  const extension = extensionSource(input);
  const referencesRequested = referenceAssetIds(input)
    .filter((id) => id !== firstId && id !== lastId && id !== extension.asset_id);
  const wantsReferences =
    precision.multi_reference_control_required === true ||
    referencesRequested.length > 1;
  const wantsExtension = precision.video_extension_required === true || Boolean(extension.asset_id);

  if (lastId && !firstId) {
    throw new Error("GEMINI_VEO_LAST_FRAME_REQUIRES_FIRST_FRAME_ASSET");
  }
  if (precision.exact_last_frame_required === true && !lastId) {
    throw new Error("GEMINI_VEO_EXACT_LAST_FRAME_ASSET_REQUIRED");
  }
  if (wantsReferences && !referencesRequested.length) {
    throw new Error("GEMINI_VEO_REFERENCE_ASSETS_REQUIRED");
  }
  const referenceLimit = Number(profile.reference_image_limit);
  if (
    Number.isFinite(referenceLimit) &&
    referenceLimit >= 0 &&
    referencesRequested.length > referenceLimit
  ) {
    throw new Error("GEMINI_VEO_REFERENCE_IMAGE_LIMIT_EXCEEDED");
  }
  if (wantsExtension && !extension.asset_id) {
    throw new Error("GEMINI_VEO_EXTENSION_SOURCE_ASSET_REQUIRED");
  }

  const resolution = requestedResolution(input, profile);
  const duration = validateDuration(
    profile,
    resolution,
    requestedDuration(input),
  );
  const aspectRatio = requestedAspectRatio(input, profile);
  if (wantsExtension) {
    validateExtension({ extension, profile, resolution, configuration });
  }

  const [first, last, extensionVideo, ...references] = await Promise.all([
    firstId ? materializeAsset({ input, assetId: firstId, kind: "image" }) : null,
    lastId ? materializeAsset({ input, assetId: lastId, kind: "image" }) : null,
    extension.asset_id
      ? materializeAsset({ input, assetId: extension.asset_id, kind: "video" })
      : null,
    ...referencesRequested.map((assetId) =>
      materializeAsset({ input, assetId, kind: "image" }),
    ),
  ]);

  const instance = {
    prompt: serializedInstruction(input),
    ...(first ? { image: { inlineData: first.inlineData } } : {}),
    ...(last ? { lastFrame: { inlineData: last.inlineData } } : {}),
    ...(references.length
      ? {
          referenceImages: references.map((reference) => ({
            image: { inlineData: reference.inlineData },
            referenceType: "asset",
          })),
        }
      : {}),
    ...(extensionVideo ? { video: { inlineData: extensionVideo.inlineData } } : {}),
  };

  return {
    request: {
      instances: [instance],
      parameters: {
        numberOfVideos: 1,
        durationSeconds: duration,
        aspectRatio,
        resolution,
      },
    },
    evidence: {
      contract: CONTRACT,
      configuration_contract: profile.contract,
      pricing_id: configuration.pricing_id,
      first_frame_asset_id: first?.asset_id || null,
      last_frame_asset_id: last?.asset_id || null,
      reference_asset_ids: references.map((item) => item.asset_id),
      extension_source_asset_id: extensionVideo?.asset_id || null,
      extension_source_provider: extension.provider,
      extension_source_model: extension.model,
      duration_seconds: duration,
      aspect_ratio: aspectRatio,
      resolution,
      native_audio: typeof profile.native_audio === "boolean"
        ? profile.native_audio
        : null,
      native_frame_rate: Number.isFinite(Number(profile.native_frame_rate))
        ? Number(profile.native_frame_rate)
        : null,
      provider_prompts_persisted: false,
    },
  };
}

function generatedVideoUri(result = {}) {
  return text(
    result?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
    result?.response?.generatedVideos?.[0]?.video?.uri,
  ) || null;
}

export const GeminiVeoProviderRuntime = {
  id: PROVIDER_ID,
  contract: CONTRACT,

  async execute(input = {}) {
    const configuration = await executionConfiguration(input);
    const key = apiKey(input);
    const built = await buildRequest(input, configuration);
    const result = await requestJson(
      `${API_BASE}/models/${encodeURIComponent(configuration.model)}:predictLongRunning`,
      key,
      {
        method: "POST",
        body: JSON.stringify(built.request),
      },
    );
    const operationName = text(result.name);
    const providerJobId = encodeJob(operationName);

    return {
      success: true,
      provider: configuration.provider,
      model: configuration.model,
      output: {
        provider_job_id: providerJobId,
        provider_operation_name: operationName,
        status: "processing",
        provider_status: "processing",
        direct_veo_precision: true,
        precision_contract: CONTRACT,
        precision_evidence: built.evidence,
        prompt_contract: {
          serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
          serialized_at_execution: true,
          persisted: false,
          submitted_character_count: serializedInstruction(input).length,
        },
      },
    };
  },

  async getStatus(input = {}) {
    const key = apiKey(input);
    const providerJobId = text(input.job_id || input.provider_job_id);
    const operationName = decodeJob(providerJobId);
    const result = await requestJson(`${API_BASE}/${operationName}`, key, {
      method: "GET",
    });
    const model = text(input.model || input.generation?.model) || null;

    if (result.error) {
      return {
        success: false,
        failed: true,
        pending: false,
        provider: PROVIDER_ID,
        model,
        provider_job_id: providerJobId,
        provider_status: "failed",
        error: googleError(result.error),
      };
    }

    if (result.done !== true) {
      return {
        success: true,
        failed: false,
        pending: true,
        provider: PROVIDER_ID,
        model,
        provider_job_id: providerJobId,
        provider_status: "processing",
      };
    }

    const uri = generatedVideoUri(result);
    if (!uri) {
      return {
        success: false,
        failed: true,
        pending: false,
        provider: PROVIDER_ID,
        model,
        provider_job_id: providerJobId,
        provider_status: "failed",
        error: "GEMINI_VEO_COMPLETED_VIDEO_URI_REQUIRED",
      };
    }

    const downloaded = await downloadVideo(uri, key);
    const stored = await persistVideo({
      bytes: downloaded.bytes,
      mimeType: downloaded.mime_type,
      operationName,
      input,
    });

    return {
      success: true,
      failed: false,
      pending: false,
      provider: PROVIDER_ID,
      model,
      provider_job_id: providerJobId,
      provider_status: "completed",
      output: {
        provider_job_id: providerJobId,
        provider_operation_name: operationName,
        status: "completed",
        provider_status: "completed",
        direct_veo_precision: true,
        precision_contract: CONTRACT,
        ...stored,
      },
    };
  },
};
