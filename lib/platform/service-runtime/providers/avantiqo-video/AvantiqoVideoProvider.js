import {
  resolveFirstCreativeProviderAssetUrl,
  resolveCreativeProviderAssetUrl,
} from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const DEFAULT_TIMEOUT_MS = 30000;
const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const OUTPUT_BUCKET = "creative-assets";
const IMPLEMENTED_CAPABILITIES = new Set([
  "ai.video.generate",
  "ai.video.image_to_video",
  "ai.video.video_to_video",
  "ai.video.edit",
]);
const DEFAULT_CERTIFIED_CAPABILITIES = new Set([
  "ai.video.generate",
  "ai.video.image_to_video",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function certifiedCapabilities() {
  const configured = text(process.env.AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => IMPLEMENTED_CAPABILITIES.has(item));
  return configured.length ? new Set(configured) : DEFAULT_CERTIFIED_CAPABILITIES;
}

function cleanOutput(value, depth = 0) {
  if (depth > 8) return "[depth-limited]";
  if (Array.isArray(value)) return value.map((item) => cleanOutput(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  const forbidden = new Set([
    "reasoning", "reasoning_content", "chain_of_thought", "chainofthought",
    "cot", "thoughts", "scratchpad", "analysis",
  ]);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !forbidden.has(String(key).toLowerCase()))
      .map(([key, child]) => [key, cleanOutput(child, depth + 1)]),
  );
}

function engineConfiguration() {
  const endpointId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);
  const apiKey = text(process.env.RUNPOD_API_KEY);
  if (!endpointId) throw new Error("RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID_REQUIRED");
  if (!apiKey) throw new Error("RUNPOD_API_KEY_REQUIRED");
  if (!/^[A-Za-z0-9_-]+$/.test(endpointId)) {
    throw new Error("RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID_INVALID");
  }
  return { endpointId, apiKey, baseUrl: `${RUNPOD_API_BASE}/${endpointId}` };
}

function duration(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 5;
  return Math.max(2, Math.min(10, Math.round(number)));
}

function ratio(value) {
  const normalized = text(value).toLowerCase().replace(/\s+/g, "");
  if (["9:16", "720:1280", "1080:1920", "720x1280", "1080x1920"].includes(normalized)) return "9:16";
  if (["1:1", "720:720", "1080:1080", "720x720", "1080x1080"].includes(normalized)) return "1:1";
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

function runpodStatus(value) {
  const normalized = text(value).toUpperCase();
  if (["COMPLETED", "COMPLETE", "SUCCEEDED", "SUCCESS", "DONE"].includes(normalized)) return "completed";
  if (["FAILED", "ERROR", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(normalized)) return "failed";
  if (["IN_QUEUE", "QUEUED", "PENDING"].includes(normalized)) return "queued";
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

async function sourceVideoUrl(input = {}) {
  const organizationId = text(input.context?.organization_id);
  if (!organizationId) throw new Error("organization_id required");
  const candidates = [
    input.video,
    input.source_video,
    input.sourceVideo,
    input.input_video,
    input.inputVideo,
    input.provider_parameters?.source_video,
    input.generation?.provider_parameters?.source_video,
    selectedAssets(input),
  ].flat(Infinity).filter(Boolean);
  for (const candidate of candidates) {
    const resolved = await resolveFirstCreativeProviderAssetUrl({
      organization_id: organizationId,
      values: [candidate],
    });
    if (resolved) return resolved;
  }
  return null;
}

function requestPrompt(input = {}) {
  return text(
    input.provider_prompt ||
      input.prompt ||
      input.instructions_text ||
      input.instructions ||
      input.generation?.instructions ||
      input.generation?.prompt,
  );
}

function headers(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function responseJson(response) {
  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { message: raw };
  }
  if (!response.ok) {
    const message = text(body?.error?.message || body?.error || body?.message || raw);
    throw new Error(
      `AVANTIQO_VIDEO_RUNPOD_REQUEST_FAILED:${response.status}:${message || "UNKNOWN"}`,
    );
  }
  return body;
}

async function withTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Math.max(
    1000,
    Number(process.env.AVANTIQO_VIDEO_ENGINE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  );
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function outputUploadTarget({ organizationId, usageId }) {
  if (!organizationId) throw new Error("organization_id required");
  if (!usageId) throw new Error("usage_id required");
  const safeUsageId = text(usageId).replace(/[^A-Za-z0-9_-]/g, "");
  if (!safeUsageId) throw new Error("AVANTIQO_VIDEO_USAGE_ID_INVALID");
  const path = `${organizationId}/generated/avantiqo-video/${safeUsageId}.mp4`;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(OUTPUT_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("AVANTIQO_VIDEO_SIGNED_UPLOAD_URL_REQUIRED");
  return {
    signed_url: data.signedUrl,
    storage_reference: `storage://${OUTPUT_BUCKET}/${path}`,
  };
}

function normalizedSubmission(body = {}) {
  const jobId = text(body.id || body.job_id || body.jobId) || null;
  return { jobId, status: runpodStatus(body.status || "IN_QUEUE") };
}

async function signedCompletedOutput({ body, organizationId }) {
  if (runpodStatus(body.status) !== "completed") return null;
  const output = object(body.output);
  const storageReference = text(output.storage_reference || output.storageReference);
  if (!storageReference) return cleanOutput(output);
  const signedUrl = await resolveCreativeProviderAssetUrl({
    organization_id: organizationId,
    value: storageReference,
  });
  return cleanOutput({
    ...output,
    storage_reference: storageReference,
    video_url: signedUrl,
  });
}

export const AvantiqoVideoProvider = {
  id: "avantiqo-video",

  async execute(input = {}) {
    const { baseUrl, apiKey } = engineConfiguration();
    const organizationId = text(input.context?.organization_id);
    const usageId = text(input.context?.usage_id);
    const capability = text(input.capability);
    if (!organizationId) throw new Error("organization_id required");
    if (!usageId) throw new Error("usage_id required");
    if (!certifiedCapabilities().has(capability)) {
      throw new Error(`AVANTIQO_VIDEO_CAPABILITY_NOT_CERTIFIED:${capability || "MISSING"}`);
    }

    const references = await referenceUrls(input);
    const sourceVideo = ["ai.video.video_to_video", "ai.video.edit"].includes(capability)
      ? await sourceVideoUrl(input)
      : null;
    if (capability === "ai.video.image_to_video" && !references.length) {
      throw new Error("AVANTIQO_VIDEO_IMAGE_TO_VIDEO_REFERENCE_REQUIRED");
    }
    if (["ai.video.video_to_video", "ai.video.edit"].includes(capability) && !sourceVideo) {
      throw new Error("AVANTIQO_VIDEO_SOURCE_VIDEO_REQUIRED");
    }

    const generation = object(input.generation);
    const providerParameters = {
      ...object(generation.provider_parameters),
      ...object(input.provider_parameters),
    };
    const model = text(input.model || generation.model || "avantiqo-cinema-v1");
    const prompt = requestPrompt(input);
    if (!prompt) throw new Error("AVANTIQO_VIDEO_INSTRUCTION_REQUIRED");
    const storageUpload = await outputUploadTarget({ organizationId, usageId });

    const response = await withTimeout(`${baseUrl}/run`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({
        input: {
          contract: "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1",
          capability,
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
          source_videos: sourceVideo ? [sourceVideo] : [],
          identity_lock: object(input.identity_lock || input.identityLock || generation.identity_lock),
          shot_specification: object(
            input.shot_specification || input.shotSpecification || generation.shot_specification,
          ),
          quality_profile: text(
            providerParameters.quality_profile || providerParameters.qualityProfile || "cinema",
          ) || "cinema",
          organization_id: organizationId,
          usage_id: usageId,
          storage_upload: storageUpload,
        },
      }),
    });

    const result = await responseJson(response);
    const normalized = normalizedSubmission(result);
    if (!normalized.jobId) throw new Error("AVANTIQO_VIDEO_RUNPOD_JOB_ID_REQUIRED");

    return {
      success: true,
      provider: "avantiqo-video",
      model,
      output: {
        provider_job_id: normalized.jobId,
        status: normalized.status,
        storage_reference: storageUpload.storage_reference,
        reference_images: references,
        source_video_conditioning: Boolean(sourceVideo),
        engine_contract: "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1",
        capability,
        infrastructure_provider: "RUNPOD_SERVERLESS",
        raw_reasoning_persisted: false,
      },
    };
  },

  async getStatus(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    if (!jobId) throw new Error("AVANTIQO_VIDEO_JOB_ID_REQUIRED");
    const organizationId = text(input.context?.organization_id);
    if (!organizationId) throw new Error("organization_id required");
    const { baseUrl, apiKey } = engineConfiguration();
    const response = await withTimeout(
      `${baseUrl}/status/${encodeURIComponent(jobId)}`,
      { method: "GET", headers: headers(apiKey) },
    );
    const result = await responseJson(response);
    const status = runpodStatus(result.status);
    const completedOutput = await signedCompletedOutput({ body: result, organizationId });

    if (status === "failed") {
      return cleanOutput({
        status,
        provider_job_id: jobId,
        error: result.error || result.output?.error || "Avantiqo video generation failed",
        raw_reasoning_persisted: false,
      });
    }

    return cleanOutput({
      status,
      provider_job_id: jobId,
      ...(completedOutput ? { output: completedOutput } : {}),
      raw_reasoning_persisted: false,
    });
  },
};
