import { AvantiqoVideoLocalQueueProvider, isVideoLtx25LocalJob } from "./AvantiqoVideoLocalQueueProvider.js";

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
const STUDIO_LINEAGE_CONTRACT = "AVANTIQO_VIDEO_STUDIO_LINEAGE_V1";
const SHOT_BIBLE_CONTRACT = "CREATIVE_SHOT_BIBLE_V1";
const GENERATION_ENVELOPE_CONTRACT = "CREATIVE_VIDEO_GENERATION_ENVELOPE_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}


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
        input.duration_seconds ||
        input.duration ||
        input.output_spec?.duration_seconds ||
        input.requirements?.output_spec?.duration_seconds ||
        generation.duration_seconds ||
        generation.duration ||
        generation.output_spec?.duration_seconds ||
        5,
      aspect_ratio:
        input.aspect_ratio || input.aspectRatio || input.ratio || generation.aspect_ratio || generation.ratio || "16:9",
      fps: input.fps || generation.fps || 24,
      resolution:
        input.resolution || generation.resolution || providerParameters.resolution || "3840x2176",
      provider_parameters: providerParameters,
    },
  };
}



export const AvantiqoVideoProviderV2 = {
  id: "avantiqo-video",

  async execute(input = {}) {
    const capability = text(input.capability);
    if (String(process.env.AVANTIQO_STUDIO_VISUAL_GENERATION_ENABLED || "").trim() !== "1") {
      throw new Error("STUDIO_VISUAL_GENERATION_MASTER_LOCKED");
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
    throw new Error(`AVANTIQO_VIDEO_CAPABILITY_NOT_IMPLEMENTED:${capability}`);
  },

  async getStatus(input = {}) {
    const suppliedJobId = input.job_id || input.jobId || input.provider_job_id;
    if (isVideoLtx25LocalJob(suppliedJobId)) return AvantiqoVideoLocalQueueProvider.getStatus(input);
    throw new Error("AVANTIQO_VIDEO_LEGACY_JOB_TRANSPORT_RETIRED");
  },
};

export const AVANTIQO_VIDEO_V2_ADVANCED_CAPABILITIES = ADVANCED_CAPABILITIES;
export const AVANTIQO_VIDEO_V2_ROUTED_MASTERED_CAPABILITIES = ROUTED_MASTERED_CAPABILITIES;
export const AVANTIQO_VIDEO_V2_MODAL_JOB_PREFIX = null;
