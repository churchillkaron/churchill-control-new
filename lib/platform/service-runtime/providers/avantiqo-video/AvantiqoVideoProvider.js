import {
  resolveFirstCreativeProviderAssetUrl,
  resolveCreativeProviderAssetUrl,
} from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const DEFAULT_TIMEOUT_MS = 30000;
const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const OUTPUT_BUCKET = "creative-assets";
const MAX_SOURCE_RANGE_SECONDS = 600;
const IMPLEMENTED_CAPABILITIES = new Set([
  "ai.video.generate",
  "ai.video.image_to_video",
  "ai.video.first_last_frame_to_video",
  "ai.video.video_to_video",
  "ai.video.edit",
  "ai.video.inpaint",
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

function optionalSeconds(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    number < 0 ||
    number > MAX_SOURCE_RANGE_SECONDS
  ) {
    throw new Error(`AVANTIQO_VIDEO_${field}_INVALID`);
  }
  return number;
}

function sourceRange(input = {}, generation = {}, providerParameters = {}) {
  const start = optionalSeconds(
    input.source_start_seconds ??
      input.sourceStartSeconds ??
      generation.source_start_seconds ??
      generation.sourceStartSeconds ??
      providerParameters.source_start_seconds ??
      providerParameters.sourceStartSeconds,
    "SOURCE_START_SECONDS",
  );
  const end = optionalSeconds(
    input.source_end_seconds ??
      input.sourceEndSeconds ??
      generation.source_end_seconds ??
      generation.sourceEndSeconds ??
      providerParameters.source_end_seconds ??
      providerParameters.sourceEndSeconds,
    "SOURCE_END_SECONDS",
  );
  const normalizedStart = start ?? 0;
  if (end !== null && end <= normalizedStart) {
    throw new Error("AVANTIQO_VIDEO_SOURCE_RANGE_INVALID");
  }
  return {
    start: normalizedStart,
    end,
    bound: normalizedStart > 0 || end !== null,
  };
}

function runpodStatus(value) {
  const normalized = text(value).toUpperCase();
  if (["COMPLETED", "COMPLETE", "SUCCEEDED", "SUCCESS", "DONE"].includes(normalized)) return "completed";
  if (["FAILED", "ERROR", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(normalized)) return "failed";
  if (["IN_QUEUE", "QUEUED", "PENDING"].includes(normalized)) return "queued";
  return "processing";
}

async function resolveSemanticAsset(input = {}, values = []) {
  const organizationId = text(input.context?.organization_id);
  if (!organizationId) throw new Error("organization_id required");
  for (const candidate of values.flat(Infinity).filter(Boolean)) {
    const resolved = await resolveFirstCreativeProviderAssetUrl({
      organization_id: organizationId,
      values: [candidate],
    });
    if (resolved) return resolved;
  }
  return null;
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

async function firstFrameUrl(input = {}) {
  return resolveSemanticAsset(input, [
    input.first_frame,
    input.firstFrame,
    input.start_frame,
    input.startFrame,
    input.provider_parameters?.first_frame,
    input.provider_parameters?.firstFrame,
    input.generation?.provider_parameters?.first_frame,
    input.generation?.provider_parameters?.firstFrame,
    input.image,
    input.source_image,
    input.sourceImage,
  ]);
}

async function lastFrameUrl(input = {}) {
  return resolveSemanticAsset(input, [
    input.last_frame,
    input.lastFrame,
    input.end_frame,
    input.endFrame,
    input.provider_parameters?.last_frame,
    input.provider_parameters?.lastFrame,
    input.generation?.provider_parameters?.last_frame,
    input.generation?.provider_parameters?.lastFrame,
  ]);
}

async function sourceVideoUrl(input = {}) {
  return resolveSemanticAsset(input, [
    input.source_video,
    input.sourceVideo,
    input.provider_parameters?.source_video,
    input.provider_parameters?.sourceVideo,
    input.generation?.provider_parameters?.source_video,
    input.generation?.provider_parameters?.sourceVideo,
    input.input_video,
    input.inputVideo,
    input.video,
  ]);
}

async function maskVideoUrl(input = {}) {
  return resolveSemanticAsset(input, [
    input.mask_video,
    input.maskVideo,
    input.video_mask,
    input.videoMask,
    input.provider_parameters?.mask_video,
    input.provider_parameters?.maskVideo,
    input.generation?.provider_parameters?.mask_video,
    input.generation?.provider_parameters?.maskVideo,
  ]);
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

function cinematicControl(input = {}, generation = {}) {
  const shot = object(
    input.shot_specification ||
    input.shotSpecification ||
    generation.shot_specification,
  );
  return {
    contract: "AVANTIQO_CINEMATIC_CONTROL_V1",
    identity_lock: object(
      input.identity_lock || input.identityLock || generation.identity_lock,
    ),
    shot_specification: shot,
    camera: object(input.camera || shot.camera || input.requirements?.camera),
    continuity: object(
      input.continuity || shot.continuity || input.requirements?.continuity,
    ),
    frame_contract: object(
      input.frame_contract || input.frameContract || shot.frame_contract,
    ),
    negative_constraints: Array.isArray(input.negative_constraints)
      ? input.negative_constraints
      : Array.isArray(input.requirements?.negative_constraints)
        ? input.requirements.negative_constraints
        : [],
  };
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

    const generation = object(input.generation);
    const providerParameters = {
      ...object(generation.provider_parameters),
      ...object(input.provider_parameters),
    };
    const references = await referenceUrls(input);
    const firstFrame = capability === "ai.video.first_last_frame_to_video"
      ? await firstFrameUrl(input)
      : null;
    const lastFrame = capability === "ai.video.first_last_frame_to_video"
      ? await lastFrameUrl(input)
      : null;
    const sourceRequired = [
      "ai.video.video_to_video",
      "ai.video.edit",
      "ai.video.inpaint",
    ].includes(capability);
    const sourceVideo = sourceRequired ? await sourceVideoUrl(input) : null;
    const maskVideo = ["ai.video.edit", "ai.video.inpaint"].includes(capability)
      ? await maskVideoUrl(input)
      : null;
    const range = sourceRequired
      ? sourceRange(input, generation, providerParameters)
      : { start: 0, end: null, bound: false };

    if (capability === "ai.video.image_to_video" && !references.length) {
      throw new Error("AVANTIQO_VIDEO_IMAGE_TO_VIDEO_REFERENCE_REQUIRED");
    }
    if (capability === "ai.video.first_last_frame_to_video" && (!firstFrame || !lastFrame)) {
      throw new Error("AVANTIQO_VIDEO_FIRST_AND_LAST_FRAME_REQUIRED");
    }
    if (sourceRequired && !sourceVideo) {
      throw new Error("AVANTIQO_VIDEO_SOURCE_VIDEO_REQUIRED");
    }
    if (capability === "ai.video.inpaint" && !maskVideo) {
      throw new Error("AVANTIQO_VIDEO_INPAINT_MASK_VIDEO_REQUIRED");
    }

    const model = text(input.model || generation.model || "avantiqo-cinema-v1");
    const prompt = requestPrompt(input);
    if (!prompt) throw new Error("AVANTIQO_VIDEO_INSTRUCTION_REQUIRED");
    const storageUpload = await outputUploadTarget({ organizationId, usageId });
    const control = cinematicControl(input, generation);

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
          first_frame: firstFrame,
          last_frame: lastFrame,
          source_video: sourceVideo,
          source_start_seconds: range.start,
          source_end_seconds: range.end,
          mask_video: maskVideo,
          cinematic_control: control,
          identity_lock: control.identity_lock,
          shot_specification: control.shot_specification,
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
        first_frame_conditioning: Boolean(firstFrame),
        last_frame_conditioning: Boolean(lastFrame),
        source_video_conditioning: Boolean(sourceVideo),
        source_range_bound: range.bound,
        source_start_seconds: range.start,
        source_end_seconds: range.end,
        mask_video_conditioning: Boolean(maskVideo),
        localized_editing: Boolean(maskVideo),
        cinematic_control_contract: control.contract,
        identity_lock_bound: Object.keys(control.identity_lock).length > 0,
        camera_control_bound: Object.keys(control.camera).length > 0,
        continuity_control_bound: Object.keys(control.continuity).length > 0,
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
