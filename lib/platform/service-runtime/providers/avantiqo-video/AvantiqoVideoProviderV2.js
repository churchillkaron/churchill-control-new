import { createAvantiqoOwnedRunpodWorker } from "../avantiqo-owned/AvantiqoOwnedRunpodWorker.js";
import { createAvantiqoOwnedModalWorker } from "../avantiqo-owned/AvantiqoOwnedModalWorker.js";
import { AvantiqoVideoProvider } from "./AvantiqoVideoProvider.js";
import {
  AvantiqoVideoWorkflowRuntime,
  AVANTIQO_VIDEO_WORKFLOW_JOB_PREFIX,
} from "./AvantiqoVideoWorkflowRuntime.js";
import {
  AvantiqoVideoWorkflowRuntimeV2,
  AVANTIQO_VIDEO_WORKFLOW_V2_JOB_PREFIX,
} from "./AvantiqoVideoWorkflowRuntimeV2.js";
import {
  AvantiqoVideoWorkflowRuntimeV4,
  AVANTIQO_VIDEO_WORKFLOW_V4_JOB_PREFIX,
} from "./AvantiqoVideoWorkflowRuntimeV4.js";

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
const LIPSYNC_JOB_PREFIX = "lipsync:";
const MODAL_VIDEO_JOB_PREFIX = "modal-video:";
const MODAL_VIDEO_APP_NAME = "avantiqo-video-owned";
const MODAL_VIDEO_FUNCTION_NAME = "generate_native_job";
const MODAL_VIDEO_ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V2";
const MODAL_VIDEO_MODEL = "avantiqo-ltx-2.5";
const STUDIO_LINEAGE_CONTRACT = "AVANTIQO_VIDEO_STUDIO_LINEAGE_V1";
const SHOT_BIBLE_CONTRACT = "CREATIVE_SHOT_BIBLE_V1";

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

function advancedInput(input = {}) {
  const generation = object(input.generation);
  const providerParameters = {
    ...object(generation.provider_parameters),
    ...object(input.provider_parameters),
  };
  const lineage = studioLineage(input);
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

function prefixJob(result = {}, prefix) {
  const jobId = text(result.output?.provider_job_id);
  if (!jobId) return result;
  return {
    ...result,
    output: {
      ...result.output,
      provider_job_id: `${prefix}${jobId}`,
    },
  };
}

function stripPrefix(value, prefix) {
  const jobId = text(value);
  return jobId.startsWith(prefix) ? jobId.slice(prefix.length) : null;
}

function workflowV4Job(value) {
  return text(value).startsWith(AVANTIQO_VIDEO_WORKFLOW_V4_JOB_PREFIX);
}
function workflowV2Job(value) {
  return text(value).startsWith(AVANTIQO_VIDEO_WORKFLOW_V2_JOB_PREFIX);
}
function legacyWorkflowJob(value) {
  return text(value).startsWith(AVANTIQO_VIDEO_WORKFLOW_JOB_PREFIX);
}
function modalVideoJob(value) {
  return text(value).startsWith(MODAL_VIDEO_JOB_PREFIX);
}

export const AvantiqoVideoProviderV2 = {
  id: "avantiqo-video",

  async execute(input = {}) {
    const capability = text(input.capability);
    if (ROUTED_MASTERED_CAPABILITIES.has(capability)) {
      return modalVideoWorker.execute(advancedInput(input));
    }
    if (!ADVANCED_CAPABILITIES.has(capability)) {
      return AvantiqoVideoProvider.execute(input);
    }
    if (!certifiedCapabilities().has(capability)) {
      throw new Error(`AVANTIQO_VIDEO_CAPABILITY_NOT_CERTIFIED:${capability}`);
    }
    if (capability === "ai.video.lipsync") {
      return prefixJob(await lipsyncWorker.execute(advancedInput(input)), LIPSYNC_JOB_PREFIX);
    }
    return advancedWorker.execute(advancedInput(input));
  },

  async getStatus(input = {}) {
    const suppliedJobId = input.job_id || input.jobId || input.provider_job_id;
    if (modalVideoJob(suppliedJobId)) {
      return modalVideoWorker.getStatus({
        ...input,
        job_id: suppliedJobId,
        provider_job_id: suppliedJobId,
      });
    }
    if (workflowV4Job(suppliedJobId)) return AvantiqoVideoWorkflowRuntimeV4.getStatus(input);
    if (workflowV2Job(suppliedJobId)) return AvantiqoVideoWorkflowRuntimeV2.getStatus(input);
    if (legacyWorkflowJob(suppliedJobId)) return AvantiqoVideoWorkflowRuntime.getStatus(input);

    const rawLipSyncJobId = stripPrefix(suppliedJobId, LIPSYNC_JOB_PREFIX);
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
export const AVANTIQO_VIDEO_V2_ROUTED_MASTERED_CAPABILITIES = ROUTED_MASTERED_CAPABILITIES;
export const AVANTIQO_VIDEO_V2_LIPSYNC_JOB_PREFIX = LIPSYNC_JOB_PREFIX;
export const AVANTIQO_VIDEO_V2_MODAL_JOB_PREFIX = MODAL_VIDEO_JOB_PREFIX;
