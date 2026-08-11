import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import {
  resolveFirstCreativeProviderAssetUrl,
} from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";

const DEFAULT_TEXT_MODEL = "bytedance/seedance-2.0/fast/text-to-video";
const DEFAULT_IMAGE_MODEL = "bytedance/seedance-2.0/fast/image-to-video";
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

async function resolveCredential(credentialId = null) {
  const credential = credentialId
    ? await CredentialRuntime.resolve(credentialId)
    : null;
  const reference = text(credential?.secret_reference || credential?.api_key);
  const apiKey = reference.startsWith("env:")
    ? text(process.env[reference.slice(4)])
    : reference || text(process.env.FAL_KEY || process.env.FAL_API_KEY);

  if (!apiKey) throw new Error("SEEDANCE_FAL_CREDENTIAL_REQUIRED");
  return { credential, apiKey };
}

function normalizedModel(value, sourceImageUrl = null) {
  const model = text(value) || (sourceImageUrl ? DEFAULT_IMAGE_MODEL : DEFAULT_TEXT_MODEL);
  if (!/^bytedance\/seedance-2\.0\/(?:fast\/)?(?:text-to-video|image-to-video)$/i.test(model)) {
    throw new Error(`SEEDANCE_MODEL_INVALID:${model}`);
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
  if (!raw) throw new Error("SEEDANCE_REQUEST_ID_REQUIRED");
  const index = raw.lastIndexOf(JOB_SEPARATOR);
  if (index < 0) {
    return { model: normalizedModel(fallbackModel), requestId: raw };
  }
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
    throw new Error(`SEEDANCE_${label}_URL_INVALID`);
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
    throw new Error(`SEEDANCE_${label}_URL_UNTRUSTED`);
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

function falErrorMessage(result = {}, status, rawText = "") {
  return [
    `Seedance/FAL request failed with status ${status}`,
    text(result?.error?.message || result?.error || result?.message || result?.detail),
    text(rawText).slice(0, 1000),
  ].filter(Boolean).join(" | ");
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
    throw new Error(falErrorMessage(result, response.status, raw));
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

function normalizedDuration(value) {
  if (text(value).toLowerCase() === "auto" || value === undefined || value === null || value === "") {
    return "auto";
  }
  const duration = Number(value);
  if (!Number.isInteger(duration) || duration < 4 || duration > 15) {
    throw new Error(`SEEDANCE_DURATION_INVALID:${value}`);
  }
  return duration;
}

export const SeedanceProvider = {
  id: "seedance",

  async execute(input = {}) {
    if (text(input.capability) !== "ai.video.generate") {
      throw new Error(`SEEDANCE_CAPABILITY_NOT_SUPPORTED:${text(input.capability)}`);
    }

    const { apiKey } = await resolveCredential(input.credential_id);
    const sourceImageUrl = await resolveFirstCreativeProviderAssetUrl({
      organization_id: input.context?.organization_id,
      values: [
        input.source,
        input.image,
        input.image_url,
        input.imageUrl,
        selectedAssets(input),
      ],
    });
    const model = normalizedModel(input.model || input.generation?.model, sourceImageUrl);
    const generation = object(input.generation);
    const output = object(input.output_spec || input.outputSpec || generation.output_spec);
    const providerParameters = {
      ...object(generation.provider_parameters),
      ...object(input.provider_parameters),
      ...object(input.provider_options || input.providerOptions),
    };
    const prompt = text(
      input.prompt ||
      input.instructions?.prompt ||
      input.provider_prompt ||
      generation.provider_prompt,
    );
    if (!prompt) throw new Error("SEEDANCE_PROMPT_REQUIRED");

    const duration = normalizedDuration(
      input.duration_seconds ??
      input.duration ??
      output.duration_seconds ??
      generation.estimated_seconds ??
      providerParameters.duration,
    );
    const generateAudio =
      input.generate_audio ??
      input.generateAudio ??
      providerParameters.generate_audio ??
      false;
    const body = compactObject({
      prompt,
      ...(model.includes("image-to-video") ? { image_url: sourceImageUrl } : {}),
      resolution: input.resolution ?? output.resolution ?? providerParameters.resolution ?? "720p",
      duration,
      aspect_ratio: input.aspect_ratio ?? input.aspectRatio ?? output.aspect_ratio ?? providerParameters.aspect_ratio ?? "auto",
      generate_audio: Boolean(generateAudio),
      seed: input.seed ?? providerParameters.seed,
      end_user_id: input.end_user_id ?? providerParameters.end_user_id,
      ...providerParameters,
    });

    if (model.includes("image-to-video") && !sourceImageUrl) {
      throw new Error("SEEDANCE_IMAGE_TO_VIDEO_SOURCE_REQUIRED");
    }

    const result = await requestJson({
      url: queueUrl(model),
      apiKey,
      method: "POST",
      body,
    });
    const requestId = text(result.request_id || result.requestId);
    const videoUrl = outputVideoUrl(result);
    if (!requestId && !videoUrl) throw new Error("SEEDANCE_OUTPUT_OR_REQUEST_ID_REQUIRED");
    const queue = requestId
      ? queueReferences(result, model, requestId)
      : { status_url: null, response_url: null, cancel_url: null };

    return {
      success: true,
      provider: "seedance",
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
        duration_seconds: duration,
        native_audio: Boolean(generateAudio),
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
        provider: "seedance",
        model: decoded.model,
        provider_job_id: encodeJobId(decoded.model, decoded.requestId),
        provider_status: state.toLowerCase(),
        error: text(status?.error?.message || status?.error || status?.message || status?.detail) || "Seedance video generation failed",
        queue,
        raw: status,
      };
    }

    if (!completed) {
      return {
        success: true,
        failed: false,
        pending: true,
        provider: "seedance",
        model: decoded.model,
        provider_job_id: encodeJobId(decoded.model, decoded.requestId),
        provider_status: state.toLowerCase() || "processing",
        queue,
        raw: status,
      };
    }

    const result = await requestJson({ url: queue.response_url, apiKey });
    const videoUrl = outputVideoUrl(result);
    if (!videoUrl) throw new Error("SEEDANCE_COMPLETED_VIDEO_URL_REQUIRED");

    return {
      success: true,
      failed: false,
      pending: false,
      provider: "seedance",
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
