import { AvantiqoVideoLocalQueueProvider, isVideoLtx25LocalJob } from "./AvantiqoVideoLocalQueueProvider.js";

const ROUTED_MASTERED_CAPABILITIES = new Set([
  "ai.video.generate",
  "ai.video.image_to_video",
  "ai.video.first_last_frame_to_video",
]);
const STUDIO_LINEAGE_CONTRACT = "AVANTIQO_VIDEO_STUDIO_LINEAGE_V1";
const SHOT_BIBLE_CONTRACT = "CREATIVE_SHOT_BIBLE_V1";
const GENERATION_ENVELOPE_CONTRACT = "CREATIVE_VIDEO_GENERATION_ENVELOPE_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}


const fastModalVideoWorker = createAvantiqoOwnedModalWorker({
  providerId: "avantiqo-video",
  family: "video",
  engineContract: "AVANTIQO_INVESTOR_T2V_DISTILLED_MODAL_V1",
  transportMode: "direct-sdk",
  jobPrefix: FAST_MODAL_VIDEO_JOB_PREFIX,
  appName: MODAL_VIDEO_APP_NAME,
  functionName: FAST_MODAL_VIDEO_FUNCTION_NAME,
  enabledEnv: "AVANTIQO_VIDEO_ENGINE_ENABLED",
  timeoutEnv: "AVANTIQO_VIDEO_ENGINE_TIMEOUT_MS",
  defaultModel: MODAL_VIDEO_MODEL,
  outputExtension: "mp4",
});

const fastModalI2vWorker = createAvantiqoOwnedModalWorker({
  providerId: "avantiqo-video",
  family: "video",
  engineContract: "AVANTIQO_INVESTOR_T2V_DISTILLED_MODAL_V1",
  transportMode: "direct-sdk",
  jobPrefix: FAST_MODAL_VIDEO_JOB_PREFIX,
  appName: MODAL_VIDEO_APP_NAME,
  functionName: FAST_MODAL_I2V_FUNCTION_NAME,
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
  const lineage = studioLineage(input);
  if (lineage && text(envelope.contract) !== GENERATION_ENVELOPE_CONTRACT) {
    throw new Error("AVANTIQO_VIDEO_GENERATION_ENVELOPE_REQUIRED");
  }
  if (lineage && text(envelope.shot_id) !== text(input.shot_id || input.shot_bible?.shot_id)) {
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
  const { studio_lineage: _untrustedStudioLineage, ...metadataWithoutStudioLineage } = object(input.metadata);
  return {
    ...input,
    metadata: {
      ...metadataWithoutStudioLineage,
      ...(lineage ? { studio_lineage: lineage } : {}),
      compute_target: "APPROVED_BURST_GPU",
      modal_fallback_forbidden_without_owner_approval: true,
    },
    generation_envelope: envelope,
    generation: {
      ...generation,
      duration_seconds:
        input.duration_seconds ||
        input.duration ||
        input.output_spec?.duration_seconds ||
        input.requirements?.output_spec?.duration_seconds ||
        generation.duration_seconds ||
        generation.duration ||
        generation.output_spec?.duration_seconds ||
        5,
      aspect_ratio:
        input.aspect_ratio ||
        input.aspectRatio ||
        input.ratio ||
        generation.aspect_ratio ||
        generation.ratio ||
        "16:9",
      fps: input.fps || generation.fps || 24,
      resolution:
        input.resolution ||
        generation.resolution ||
        providerParameters.resolution ||
        "1920x1088",
      provider_parameters: providerParameters,
    },
  };
}



export const AvantiqoVideoProviderV2 = {
  id: "avantiqo-video",

  async execute(input = {}) {
    const capability = text(input.capability);

    if (LOCAL_ONLY_CAPABILITIES.has(capability)) {
      throw new Error("AVANTIQO_VIDEO_TEMPORAL_UPSCALE_LOCAL_NODE_REQUIRED");
    }
    if (capability === "ai.video.generate") {
      return AvantiqoVideoLocalQueueProvider.execute(advancedInput(input));
    }
    if (ROUTED_MASTERED_CAPABILITIES.has(capability)) {
      advancedInput(input);
      throw new Error("AVANTIQO_VIDEO_LOCAL_ENGINE_NOT_IMPLEMENTED");
    }
    if (ADVANCED_CAPABILITIES.has(capability)) {
      throw new Error(`AVANTIQO_VIDEO_LOCAL_CAPABILITY_NOT_IMPLEMENTED:${capability}`);
    }
    return modalVideoWorker.execute(advancedInput(input));
  },

  async getStatus(input = {}) {
    const suppliedJobId = input.job_id || input.jobId || input.provider_job_id;
    if (isVideoLtx25LocalJob(suppliedJobId)) return AvantiqoVideoLocalQueueProvider.getStatus(input);
    throw new Error("AVANTIQO_VIDEO_LEGACY_JOB_TRANSPORT_RETIRED");
  },
};

export const AVANTIQO_VIDEO_V2_ROUTED_MASTERED_CAPABILITIES = ROUTED_MASTERED_CAPABILITIES;
export const AVANTIQO_VIDEO_V2_MODAL_JOB_PREFIX = null;
