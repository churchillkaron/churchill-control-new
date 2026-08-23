import { createAvantiqoOwnedRunpodWorker } from "../avantiqo-owned/AvantiqoOwnedRunpodWorker.js";
import { AvantiqoVideoProvider } from "./AvantiqoVideoProvider.js";

const ADVANCED_CAPABILITIES = new Set([
  "ai.video.extend",
  "ai.video.upscale",
  "ai.video.lipsync",
]);
const LIPSYNC_JOB_PREFIX = "lipsync:";

function text(value) {
  return String(value ?? "").trim();
}

function certifiedCapabilities() {
  return new Set(
    text(process.env.AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

const advancedWorker = createAvantiqoOwnedRunpodWorker({
  providerId: "avantiqo-video",
  family: "video",
  engineContract: "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1",
  endpointEnv: "RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID",
  enabledEnv: "AVANTIQO_VIDEO_ENGINE_ENABLED",
  timeoutEnv: "AVANTIQO_VIDEO_ENGINE_TIMEOUT_MS",
  defaultModel: "avantiqo-cinema-v1",
  outputExtension: "mp4",
});

const lipsyncWorker = createAvantiqoOwnedRunpodWorker({
  providerId: "avantiqo-video",
  family: "lipsync",
  engineContract: "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1",
  endpointEnv: "RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID",
  enabledEnv: "AVANTIQO_LIPSYNC_ENGINE_ENABLED",
  timeoutEnv: "AVANTIQO_LIPSYNC_ENGINE_TIMEOUT_MS",
  defaultModel: "avantiqo-cinema-lipsync-v1",
  outputExtension: "mp4",
});

function advancedInput(input = {}) {
  const generation = input.generation && typeof input.generation === "object"
    ? input.generation
    : {};
  const providerParameters = {
    ...(generation.provider_parameters || {}),
    ...(input.provider_parameters || {}),
  };
  return {
    ...input,
    generation: {
      ...generation,
      duration_seconds:
        input.duration_seconds ||
        input.duration ||
        generation.duration_seconds ||
        generation.duration ||
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
        "720p",
      provider_parameters: providerParameters,
    },
  };
}

function prefixLipSyncJob(result = {}) {
  const jobId = text(result.output?.provider_job_id);
  if (!jobId) return result;
  return {
    ...result,
    output: {
      ...result.output,
      provider_job_id: `${LIPSYNC_JOB_PREFIX}${jobId}`,
      endpoint_family: "AVANTIQO_LIPSYNC",
    },
  };
}

function stripLipSyncJobPrefix(value) {
  const jobId = text(value);
  return jobId.startsWith(LIPSYNC_JOB_PREFIX)
    ? jobId.slice(LIPSYNC_JOB_PREFIX.length)
    : null;
}

export const AvantiqoVideoProviderV2 = {
  id: "avantiqo-video",

  async execute(input = {}) {
    const capability = text(input.capability);
    if (!ADVANCED_CAPABILITIES.has(capability)) {
      return AvantiqoVideoProvider.execute(input);
    }
    if (!certifiedCapabilities().has(capability)) {
      throw new Error(`AVANTIQO_VIDEO_CAPABILITY_NOT_CERTIFIED:${capability}`);
    }
    if (capability === "ai.video.lipsync") {
      return prefixLipSyncJob(await lipsyncWorker.execute(advancedInput(input)));
    }
    return advancedWorker.execute(advancedInput(input));
  },

  async getStatus(input = {}) {
    const rawLipSyncJobId = stripLipSyncJobPrefix(
      input.job_id || input.jobId || input.provider_job_id,
    );
    if (rawLipSyncJobId) {
      const result = await lipsyncWorker.getStatus({
        ...input,
        job_id: rawLipSyncJobId,
        provider_job_id: rawLipSyncJobId,
      });
      return {
        ...result,
        provider_job_id: `${LIPSYNC_JOB_PREFIX}${rawLipSyncJobId}`,
        endpoint_family: "AVANTIQO_LIPSYNC",
      };
    }
    return AvantiqoVideoProvider.getStatus(input);
  },
};

export const AVANTIQO_VIDEO_V2_ADVANCED_CAPABILITIES = ADVANCED_CAPABILITIES;
export const AVANTIQO_VIDEO_V2_LIPSYNC_JOB_PREFIX = LIPSYNC_JOB_PREFIX;
