import {
  resolveFirstCreativeProviderAssetUrl,
} from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";

const DEFAULT_TIMEOUT_MS = 120000;

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

function engineConfiguration() {
  const baseUrl = text(process.env.AVANTIQO_VIDEO_ENGINE_URL).replace(/\/+$/, "");
  const token = text(process.env.AVANTIQO_VIDEO_ENGINE_TOKEN);
  if (!baseUrl) throw new Error("AVANTIQO_VIDEO_ENGINE_URL_REQUIRED");
  if (!token) throw new Error("AVANTIQO_VIDEO_ENGINE_TOKEN_REQUIRED");
  return { baseUrl, token };
}

function duration(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 5;
  return Math.max(2, Math.min(10, Math.round(number)));
}

function ratio(value) {
  const normalized = text(value).toLowerCase().replace(/\s+/g, "");
  if (["9:16", "720:1280", "1080:1920", "720x1280", "1080x1920"].includes(normalized)) {
    return "9:16";
  }
  if (["1:1", "720:720", "1080:1080", "720x720", "1080x1080"].includes(normalized)) {
    return "1:1";
  }
  return "16:9";
}

function seed(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 4294967295) {
    throw new Error("AVANTIQO_VIDEO_SEED_INVALID");
  }
  return number;
}

function statusValue(value) {
  const normalized = text(value).toLowerCase();
  if (["completed", "complete", "succeeded", "success", "done"].includes(normalized)) return "completed";
  if (["failed", "error", "cancelled", "canceled"].includes(normalized)) return "failed";
  if (["queued", "pending"].includes(normalized)) return "queued";
  return "processing";
}

function selectedAssets(input = {}) {
  const assets = input.assets;
  if (Array.isArray(assets)) return assets;
  if (Array.isArray(assets?.selectedAssets)) return assets.selectedAssets;
  if (Array.isArray(input.source_assets)) return input.source_assets;
  if (Array.isArray(input.sourceAssets)) return input.sourceAssets;
  if (Array.isArray(input.selected_assets)) return input.selected_assets;
  if (Array.isArray(input.selectedAssets)) return input.selectedAssets;
  return [];
}

async function referenceUrls(input = {}) {
  const organizationId = text(input.context?.organization_id);
  if (!organizationId) throw new Error("organization_id required");

  const candidates = [
    input.image,
    input.source_image,
    input.sourceImage,
    input.reference_image,
    input.referenceImage,
    input.reference_images,
    input.referenceImages,
    input.provider_parameters?.reference_images,
    input.generation?.provider_parameters?.reference_images,
    selectedAssets(input),
  ].flat(Infinity).filter(Boolean);

  const urls = [];
  for (const candidate of candidates) {
    const resolved = await resolveFirstCreativeProviderAssetUrl({
      organization_id: organizationId,
      values: [candidate],
    });
    if (resolved && !urls.includes(resolved)) urls.push(resolved);
    if (urls.length >= 4) break;
  }
  return urls;
}

function requestPrompt(input = {}) {
  return text(
    input.provider_prompt ||
    input.prompt ||
    input.instructions ||
    input.generation?.instructions ||
    input.generation?.prompt,
  );
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Avantiqo-Engine-Contract": "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1",
  };
}

async function responseJson(response) {
  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { raw };
  }
  if (!response.ok) {
    const message = text(body?.error?.message || body?.error || body?.message || raw);
    throw new Error(`AVANTIQO_VIDEO_ENGINE_REQUEST_FAILED:${response.status}:${message || "UNKNOWN"}`);
  }
  return body;
}

function normalizeOutput(result = {}) {
  const body = object(result);
  const data = object(body.data);
  const jobId = text(
    body.job_id || body.jobId || body.id || data.job_id || data.jobId || data.id,
  ) || null;
  const outputUrl = text(
    body.output_url || body.outputUrl || body.video_url || body.videoUrl ||
    data.output_url || data.outputUrl || data.video_url || data.videoUrl,
  ) || null;
  const status = statusValue(body.status || data.status || (outputUrl ? "completed" : "processing"));
  return { jobId, outputUrl, status };
}

export const AvantiqoVideoProvider = {
  id: "avantiqo-video",

  async execute(input = {}) {
    const { baseUrl, token } = engineConfiguration();
    const references = await referenceUrls(input);
    const generation = object(input.generation);
    const providerParameters = {
      ...object(generation.provider_parameters),
      ...object(input.provider_parameters),
    };
    const model = text(input.model || generation.model || "avantiqo-cinema-v1");
    const prompt = requestPrompt(input);
    if (!prompt) throw new Error("AVANTIQO_VIDEO_INSTRUCTION_REQUIRED");

    const controller = new AbortController();
    const timeoutMs = Math.max(1000, Number(process.env.AVANTIQO_VIDEO_ENGINE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS));
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(`${baseUrl}/v1/video/generations`, {
        method: "POST",
        headers: headers(token),
        signal: controller.signal,
        body: JSON.stringify({
          contract: "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1",
          model,
          instruction: prompt,
          duration_seconds: duration(
            input.duration_seconds || input.duration || generation.duration_seconds || generation.duration,
          ),
          aspect_ratio: ratio(
            input.aspect_ratio || input.aspectRatio || input.ratio || generation.aspect_ratio || generation.ratio,
          ),
          resolution: text(
            input.resolution || generation.resolution || providerParameters.resolution || "720p",
          ) || "720p",
          fps: 24,
          seed: seed(input.seed ?? generation.seed ?? providerParameters.seed),
          reference_images: references,
          identity_lock: object(input.identity_lock || input.identityLock || generation.identity_lock),
          shot_specification: object(
            input.shot_specification || input.shotSpecification || generation.shot_specification,
          ),
          quality_profile: text(
            providerParameters.quality_profile || providerParameters.qualityProfile || "cinema",
          ) || "cinema",
          organization_id: text(input.context?.organization_id),
          usage_id: text(input.context?.usage_id),
        }),
      });
    } finally {
      clearTimeout(timeout);
    }

    const result = await responseJson(response);
    const normalized = normalizeOutput(result);
    if (!normalized.jobId && !normalized.outputUrl) {
      throw new Error("AVANTIQO_VIDEO_OUTPUT_OR_JOB_REQUIRED");
    }

    return {
      success: true,
      provider: "avantiqo-video",
      model,
      output: {
        provider_job_id: normalized.jobId,
        status: normalized.status,
        result: normalized.outputUrl,
        reference_images: references,
        engine_contract: "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1",
        raw: result,
      },
    };
  },

  async getStatus(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    if (!jobId) throw new Error("AVANTIQO_VIDEO_JOB_ID_REQUIRED");
    const { baseUrl, token } = engineConfiguration();
    const response = await fetch(
      `${baseUrl}/v1/video/generations/${encodeURIComponent(jobId)}`,
      {
        method: "GET",
        headers: headers(token),
      },
    );
    return responseJson(response);
  },
};
