import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import {
  resolveCreativeProviderAssetUrl,
  resolveFirstCreativeProviderAssetUrl,
} from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";

const DEFAULT_TEXT_MODEL = "fal-ai/veo3.1/fast";
const DEFAULT_IMAGE_MODEL = "fal-ai/veo3.1/fast/image-to-video";
const FIRST_LAST_MODEL = "fal-ai/veo3.1/fast/first-last-frame-to-video";
const QUEUE_BASE = "https://queue.fal.run";
const JOB_SEPARATOR = "::";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) =>
      item !== undefined && item !== null && item !== ""
    ),
  );
}

function selectedAssets(input = {}) {
  if (Array.isArray(input.assets)) return input.assets;
  if (Array.isArray(input.assets?.selectedAssets)) return input.assets.selectedAssets;
  if (Array.isArray(input.source_assets)) return input.source_assets;
  if (Array.isArray(input.sourceAssets)) return input.sourceAssets;
  if (Array.isArray(input.selected_assets)) return input.selected_assets;
  if (Array.isArray(input.selectedAssets)) return input.selectedAssets;
  return [];
}

function providerParameters(input = {}) {
  const generation = object(input.generation);
  return {
    ...object(generation.provider_parameters),
    ...object(input.provider_parameters),
    ...object(input.provider_options || input.providerOptions),
  };
}

function shotBible(input = {}) {
  return object(input.shot_bible || input.shotBible);
}

function precisionControl(input = {}) {
  return object(shotBible(input).precision_control);
}

function firstFrameAssetId(input = {}) {
  const params = providerParameters(input);
  const precision = precisionControl(input);
  const opening = object(shotBible(input).frame_plan?.opening_frame || shotBible(input).frame_plan?.openingFrame);
  return text(
    precision.opening_frame_asset_id ||
    precision.openingFrameAssetId ||
    params.first_frame_asset_id ||
    params.firstFrameAssetId ||
    opening.asset_id ||
    opening.assetId,
  ) || null;
}

function lastFrameAssetId(input = {}) {
  const params = providerParameters(input);
  const precision = precisionControl(input);
  const closing = object(shotBible(input).frame_plan?.closing_frame || shotBible(input).frame_plan?.closingFrame);
  return text(
    precision.closing_frame_asset_id ||
    precision.closingFrameAssetId ||
    params.last_frame_asset_id ||
    params.lastFrameAssetId ||
    closing.asset_id ||
    closing.assetId,
  ) || null;
}

async function resolveCredential(credentialId = null) {
  const credential = credentialId
    ? await CredentialRuntime.resolve(credentialId)
    : null;
  const reference = text(credential?.secret_reference || credential?.api_key);
  const apiKey = reference.startsWith("env:")
    ? text(process.env[reference.slice(4)])
    : reference || text(process.env.FAL_KEY || process.env.FAL_API_KEY);

  if (!apiKey) throw new Error("VEO_FAL_CREDENTIAL_REQUIRED");
  return { credential, apiKey };
}

function normalizedModel(value, sourceImageUrl = null, lastFrameId = null) {
  const fallback = lastFrameId
    ? FIRST_LAST_MODEL
    : sourceImageUrl
      ? DEFAULT_IMAGE_MODEL
      : DEFAULT_TEXT_MODEL;
  const model = text(value) || fallback;
  if (!new Set([
    DEFAULT_TEXT_MODEL,
    DEFAULT_IMAGE_MODEL,
    FIRST_LAST_MODEL,
  ]).has(model)) {
    throw new Error(`VEO_MODEL_INVALID:${model}`);
  }
  return model;
}

function queueUrl(model) {
  return `${QUEUE_BASE}/${model}`;
}

function requestUrl(model, requestId) {
  return `${queueUrl(model)}/requests/${encodeURIComponent(requestId)}`;
}

function statusUrl(model, requestId) {
  return `${requestUrl(model, requestId)}/status`;
}

function encodeJobId(model, requestId) {
  return `${model}${JOB_SEPARATOR}${requestId}`;
}

function decodeJobId(value, fallbackModel = DEFAULT_TEXT_MODEL) {
  const raw = text(value);
  if (!raw) throw new Error("VEO_REQUEST_ID_REQUIRED");
  const index = raw.lastIndexOf(JOB_SEPARATOR);
  if (index < 0) return { model: normalizedModel(fallbackModel), requestId: raw };
  return {
    model: normalizedModel(raw.slice(0, index)),
    requestId: text(raw.slice(index + JOB_SEPARATOR.length)),
  };
}

function trustedFalUrl(value, label) {
  const source = text(value);
  if (!source) return null;
  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    throw new Error(`VEO_${label}_URL_INVALID`);
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:" ||
    !(
      hostname === "queue.fal.run" ||
      hostname.endsWith(".fal.run") ||
      hostname === "fal.ai" ||
      hostname.endsWith(".fal.ai")
    )
  ) {
    throw new Error(`VEO_${label}_URL_UNTRUSTED`);
  }
  return parsed.toString();
}

function queueReferences(result = {}, model, requestId) {
  return {
    status_url: trustedFalUrl(
      result.status_url || result.statusUrl || statusUrl(model, requestId),
      "STATUS",
    ),
    response_url: trustedFalUrl(
      result.response_url || result.responseUrl || requestUrl(model, requestId),
      "RESPONSE",
    ),
    cancel_url: trustedFalUrl(result.cancel_url || result.cancelUrl, "CANCEL"),
  };
}

function suppliedQueueReferences(input = {}, decoded) {
  const queue = object(input.queue);
  const providerStatus = object(input.provider_status);
  const raw = object(input.raw);
  return {
    status_url: trustedFalUrl(
      input.status_url || input.statusUrl || queue.status_url || queue.statusUrl || providerStatus.status_url || providerStatus.statusUrl || raw.status_url || raw.statusUrl || statusUrl(decoded.model, decoded.requestId),
      "STATUS",
    ),
    response_url: trustedFalUrl(
      input.response_url || input.responseUrl || queue.response_url || queue.responseUrl || providerStatus.response_url || providerStatus.responseUrl || raw.response_url || raw.responseUrl || requestUrl(decoded.model, decoded.requestId),
      "RESPONSE",
    ),
    cancel_url: trustedFalUrl(
      input.cancel_url || input.cancelUrl || queue.cancel_url || queue.cancelUrl || providerStatus.cancel_url || providerStatus.cancelUrl || raw.cancel_url || raw.cancelUrl,
      "CANCEL",
    ),
  };
}

async function requestJson({ url, apiKey, method = "GET", body = null }) {
  const response = await fetch(url, {
    method,
    redirect: "follow",
    headers: compactObject({
      Authorization: `Key ${apiKey}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    }),
    ...(body ? { body: JSON.stringify(body) } : {}),
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
    throw new Error([
      `Veo/FAL request failed with status ${response.status}`,
      text(result?.error?.message || result?.error || result?.message || result?.detail),
      raw.slice(0, 1000),
    ].filter(Boolean).join(" | "));
  }
  return result;
}

function outputVideoUrl(result = {}) {
  return text(
    result?.video?.url ||
    result?.data?.video?.url ||
    result?.output?.video?.url ||
    result?.response?.video?.url ||
    result?.response?.data?.video?.url ||
    result?.url,
  ) || null;
}

function normalizedStatus(result = {}) {
  return text(result.status || result.state || result.phase).toUpperCase();
}

function durationValue(input = {}, output = {}, params = {}) {
  const raw = input.duration_seconds ?? input.duration ?? output.duration_seconds ?? params.duration;
  const number = Number(String(raw ?? "").replace(/s$/i, ""));
  if (!Number.isFinite(number) || ![4, 6, 8].includes(number)) {
    return raw || undefined;
  }
  return `${number}s`;
}

export const VeoProvider = {
  id: "veo",

  async execute(input = {}) {
    if (text(input.capability) !== "ai.video.generate") {
      throw new Error(`VEO_CAPABILITY_NOT_SUPPORTED:${text(input.capability)}`);
    }

    const { apiKey } = await resolveCredential(input.credential_id);
    const orgId = input.context?.organization_id;
    const firstId = firstFrameAssetId(input);
    const lastId = lastFrameAssetId(input);
    const sourceImageUrl = firstId
      ? await resolveCreativeProviderAssetUrl({ organization_id: orgId, value: firstId })
      : await resolveFirstCreativeProviderAssetUrl({
          organization_id: orgId,
          values: [
            input.source,
            input.image,
            input.image_url,
            input.imageUrl,
            selectedAssets(input),
          ],
        });
    const lastFrameUrl = lastId
      ? await resolveCreativeProviderAssetUrl({ organization_id: orgId, value: lastId })
      : null;
    const model = normalizedModel(input.model || input.generation?.model, sourceImageUrl, lastId);
    const generation = object(input.generation);
    const output = object(input.output_spec || input.outputSpec || generation.output_spec);
    const params = providerParameters(input);
    const prompt = text(
      input.prompt ||
      input.description ||
      input.instructions?.prompt ||
      input.provider_prompt ||
      generation.provider_prompt,
    );
    if (!prompt) throw new Error("VEO_PROMPT_REQUIRED");

    const firstLastMode = model === FIRST_LAST_MODEL;
    if (firstLastMode && (!sourceImageUrl || !lastFrameUrl)) {
      throw new Error("VEO_FIRST_LAST_FRAME_SOURCE_REQUIRED");
    }

    const providerDuration = durationValue(input, output, params);
    const body = compactObject({
      prompt,
      ...(model === DEFAULT_IMAGE_MODEL ? { image_url: sourceImageUrl } : {}),
      ...(firstLastMode ? {
        first_frame_url: sourceImageUrl,
        last_frame_url: lastFrameUrl,
      } : {}),
      duration: providerDuration,
      aspect_ratio: input.aspect_ratio ?? input.aspectRatio ?? output.aspect_ratio ?? params.aspect_ratio,
      resolution: input.resolution ?? output.resolution ?? params.resolution ?? "720p",
      generate_audio: input.generate_audio ?? input.generateAudio ?? params.generate_audio ?? false,
      negative_prompt: params.negative_prompt ?? params.negativePrompt,
      safety_tolerance: params.safety_tolerance ?? params.safetyTolerance,
      auto_fix: params.auto_fix ?? params.autoFix,
      seed: input.seed ?? params.seed,
    });

    if (model === DEFAULT_IMAGE_MODEL && !sourceImageUrl) {
      throw new Error("VEO_IMAGE_TO_VIDEO_SOURCE_REQUIRED");
    }

    const result = await requestJson({
      url: queueUrl(model),
      apiKey,
      method: "POST",
      body,
    });
    const requestId = text(result.request_id || result.requestId);
    const videoUrl = outputVideoUrl(result);
    if (!requestId && !videoUrl) throw new Error("VEO_OUTPUT_OR_REQUEST_ID_REQUIRED");
    const queue = requestId
      ? queueReferences(result, model, requestId)
      : { status_url: null, response_url: null, cancel_url: null };

    return {
      success: true,
      provider: "veo",
      model,
      output: {
        provider_job_id: requestId ? encodeJobId(model, requestId) : null,
        provider_request_id: requestId || null,
        status: requestId && !videoUrl ? "queued" : "completed",
        status_url: queue.status_url,
        response_url: queue.response_url,
        cancel_url: queue.cancel_url,
        video_url: videoUrl,
        result: videoUrl,
        source_image_url: sourceImageUrl,
        first_frame_url: firstLastMode ? sourceImageUrl : null,
        last_frame_url: firstLastMode ? lastFrameUrl : null,
        request_mode: firstLastMode ? "FIRST_LAST_FRAME_TO_VIDEO" : (sourceImageUrl ? "IMAGE_TO_VIDEO" : "TEXT_TO_VIDEO"),
        raw: result,
      },
    };
  },

  async getStatus(input = {}) {
    const { apiKey } = await resolveCredential(input.credential_id);
    const decoded = decodeJobId(
      input.job_id || input.jobId || input.provider_job_id,
      input.model,
    );
    const queue = suppliedQueueReferences(input, decoded);
    const status = await requestJson({ url: queue.status_url, apiKey });
    const state = normalizedStatus(status);
    const failed = ["FAILED", "ERROR", "CANCELLED", "CANCELED"].includes(state);
    const completed = ["COMPLETED", "SUCCEEDED", "SUCCESS", "DONE"].includes(state);

    if (failed) {
      return {
        success: false,
        failed: true,
        pending: false,
        provider: "veo",
        model: decoded.model,
        provider_job_id: encodeJobId(decoded.model, decoded.requestId),
        provider_status: state.toLowerCase(),
        error: text(status?.error?.message || status?.error || status?.message || status?.detail) || "Veo video generation failed",
        queue,
        raw: status,
      };
    }

    if (!completed) {
      return {
        success: true,
        failed: false,
        pending: true,
        provider: "veo",
        model: decoded.model,
        provider_job_id: encodeJobId(decoded.model, decoded.requestId),
        provider_status: state.toLowerCase() || "processing",
        queue,
        raw: status,
      };
    }

    const result = await requestJson({ url: queue.response_url, apiKey });
    const videoUrl = outputVideoUrl(result);
    if (!videoUrl) throw new Error("VEO_COMPLETED_VIDEO_URL_REQUIRED");

    return {
      success: true,
      failed: false,
      pending: false,
      provider: "veo",
      model: decoded.model,
      provider_job_id: encodeJobId(decoded.model, decoded.requestId),
      provider_status: "completed",
      queue,
      output: {
        video_url: videoUrl,
        result: videoUrl,
        raw: result,
      },
      raw: result,
    };
  },
};
