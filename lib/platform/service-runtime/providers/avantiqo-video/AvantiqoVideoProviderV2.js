import { createAvantiqoOwnedModalWorker } from "../avantiqo-owned/AvantiqoOwnedModalWorker.js";

const ADVANCED_CAPABILITIES = new Set([
  "ai.video.extend",
  "ai.video.upscale",
  "ai.video.lipsync",
]);
const ROUTED_MASTERED_CAPABILITIES = new Set([
  "ai.video.generate",
  "ai.video.image_to_video",
  "ai.video.first_last_frame_to_video",
]);
const MODAL_VIDEO_JOB_PREFIX = "modal-video:";
const FAST_PREVIEW_JOB_PREFIX = "modal-video-fast-preview:";
const MODAL_VIDEO_APP_NAME = "avantiqo-video-owned";
const MODAL_VIDEO_FUNCTION_NAME = "generate_native_job_v3";
const FAST_PREVIEW_FUNCTION_NAME = "generate_investor_t2v_job";
const MODAL_VIDEO_ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V2";
const MODAL_VIDEO_MODEL = "avantiqo-ltx-2.5";
const STUDIO_LINEAGE_CONTRACT = "AVANTIQO_VIDEO_STUDIO_LINEAGE_V1";
const SHOT_BIBLE_CONTRACT = "CREATIVE_SHOT_BIBLE_V1";
const GENERATION_ENVELOPE_CONTRACT = "CREATIVE_VIDEO_GENERATION_ENVELOPE_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function certifiedCapabilities() {
  return new Set(
    text(process.env.AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

const fastPreviewVideoWorker = createAvantiqoOwnedModalWorker({
  providerId: "avantiqo-video",
  family: "video",
  engineContract: MODAL_VIDEO_ENGINE_CONTRACT,
  transportMode: "direct-sdk",
  jobPrefix: FAST_PREVIEW_JOB_PREFIX,
  appName: MODAL_VIDEO_APP_NAME,
  functionName: FAST_PREVIEW_FUNCTION_NAME,
  enabledEnv: "AVANTIQO_VIDEO_ENGINE_ENABLED",
  timeoutEnv: "AVANTIQO_VIDEO_ENGINE_TIMEOUT_MS",
  defaultModel: MODAL_VIDEO_MODEL,
  outputExtension: "mp4",
});

const modalVideoWorker = createAvantiqoOwnedModalWorker({
  providerId: "avantiqo-video",
  family: "video",
  engineContract: MODAL_VIDEO_ENGINE_CONTRACT,
  transportMode: "direct-sdk",
  jobPrefix: MODAL_VIDEO_JOB_PREFIX,
  appName: MODAL_VIDEO_APP_NAME,
  functionName: MODAL_VIDEO_FUNCTION_NAME,
  enabledEnv: "AVANTIQO_VIDEO_ENGINE_ENABLED",
  timeoutEnv: "AVANTIQO_VIDEO_ENGINE_TIMEOUT_MS",
  defaultModel: MODAL_VIDEO_MODEL,
  outputExtension: "mp4",
});

function studioLineage(input = {}) {
  const shotBible = object(input.shot_bible);
  const shotId = text(input.shot_id || shotBible.shot_id);
  const hasLineage = Boolean(shotId || Object.keys(shotBible).length);
  if (!hasLineage) return null;
  if (!shotId) throw new Error("AVANTIQO_VIDEO_STUDIO_SHOT_ID_REQUIRED");
  if (text(shotBible.contract) !== SHOT_BIBLE_CONTRACT) {
    throw new Error("AVANTIQO_VIDEO_STUDIO_SHOT_BIBLE_REQUIRED");
  }
  if (text(shotBible.shot_id) && text(shotBible.shot_id) !== shotId) {
    throw new Error("AVANTIQO_VIDEO_STUDIO_SHOT_ID_MISMATCH");
  }
  return {
    contract: STUDIO_LINEAGE_CONTRACT,
    shot_id: shotId,
    shot_bible: shotBible,
  };
}

function generationEnvelope(input = {}) {
  const envelope = object(input.generation_envelope);
  if (studioLineage(input) && text(envelope.contract) !== GENERATION_ENVELOPE_CONTRACT) {
    throw new Error("AVANTIQO_VIDEO_GENERATION_ENVELOPE_REQUIRED");
  }
  if (studioLineage(input) && text(envelope.shot_id) !== text(input.shot_id || input.shot_bible?.shot_id)) {
    throw new Error("AVANTIQO_VIDEO_GENERATION_ENVELOPE_SHOT_MISMATCH");
  }
  return envelope;
}

function advancedInput(input = {}) {
  const generation = object(input.generation);
  const providerParameters = {
    ...object(generation.provider_parameters),
    ...object(input.provider_parameters),
  };
  const lineage = studioLineage(input);
  const envelope = generationEnvelope(input);
  const {
    studio_lineage: _untrustedStudioLineage,
    ...metadataWithoutStudioLineage
  } = object(input.metadata);
  return {
    ...input,
    metadata: {
      ...metadataWithoutStudioLineage,
      ...(lineage ? { studio_lineage: lineage } : {}),
    },
    generation_envelope: envelope,
    generation: {
      ...generation,
      duration_seconds:
        input.duration_seconds || input.duration || generation.duration_seconds || generation.duration || 5,
      aspect_ratio:
        input.aspect_ratio || input.aspectRatio || input.ratio || generation.aspect_ratio || generation.ratio || "16:9",
      fps: input.fps || generation.fps || 24,
      resolution:
        input.resolution || generation.resolution || providerParameters.resolution || "3840x2176",
      provider_parameters: providerParameters,
    },
  };
}

function modalVideoJob(value) {
  return text(value).startsWith(MODAL_VIDEO_JOB_PREFIX);
}
function fastPreviewVideoJob(value) {
  return text(value).startsWith(FAST_PREVIEW_JOB_PREFIX);
}
function fastPreviewRequested(input = {}) {
  const params = {
    ...object(input.generation?.provider_parameters),
    ...object(input.provider_parameters),
  };
  const profile = text(params.quality_profile || params.qualityProfile).toUpperCase();
  return ["FAST_PREVIEW", "DRAFT_PREVIEW", "BENCHMARK_PREVIEW"].includes(profile);
}

export const AvantiqoVideoProviderV2 = {
  id: "avantiqo-video",

  async execute(input = {}) {
    const capability = text(input.capability);
    if (String(process.env.AVANTIQO_STUDIO_VISUAL_GENERATION_ENABLED || "").trim() !== "1") {
      throw new Error("STUDIO_VISUAL_GENERATION_MASTER_LOCKED");
    }
    if (capability === "ai.video.generate" && fastPreviewRequested(input)) {
      return fastPreviewVideoWorker.execute(advancedInput(input));
    }
    if (ROUTED_MASTERED_CAPABILITIES.has(capability)) {
      return modalVideoWorker.execute(advancedInput(input));
    }
    if (ADVANCED_CAPABILITIES.has(capability)) {
      throw new Error(`AVANTIQO_VIDEO_MODAL_CAPABILITY_NOT_IMPLEMENTED:${capability}`);
    }
    throw new Error(`AVANTIQO_VIDEO_CAPABILITY_NOT_IMPLEMENTED:${capability}`);
  },

  async getStatus(input = {}) {
    const suppliedJobId = input.job_id || input.jobId || input.provider_job_id;
    if (fastPreviewVideoJob(suppliedJobId)) {
      return fastPreviewVideoWorker.getStatus({ ...input, job_id: suppliedJobId, provider_job_id: suppliedJobId });
    }
    if (modalVideoJob(suppliedJobId)) {
      return modalVideoWorker.getStatus({ ...input, job_id: suppliedJobId, provider_job_id: suppliedJobId });
    }
    throw new Error("AVANTIQO_VIDEO_LEGACY_JOB_TRANSPORT_RETIRED");
  },
};

export const AVANTIQO_VIDEO_V2_ADVANCED_CAPABILITIES = ADVANCED_CAPABILITIES;
export const AVANTIQO_VIDEO_V2_ROUTED_MASTERED_CAPABILITIES = ROUTED_MASTERED_CAPABILITIES;
export const AVANTIQO_VIDEO_V2_MODAL_JOB_PREFIX = MODAL_VIDEO_JOB_PREFIX;
