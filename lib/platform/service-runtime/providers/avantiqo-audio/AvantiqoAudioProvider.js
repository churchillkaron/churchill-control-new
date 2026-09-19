import { createAvantiqoOwnedModalWorker } from "../avantiqo-owned/AvantiqoOwnedModalWorker.js";
import { AvantiqoMusicLocalNodeProvider, AVANTIQO_MUSIC_LOCAL_NODE_JOB_PREFIX } from "./AvantiqoMusicLocalNodeProvider.js";
import { AvantiqoSfxLocalQueueProvider, isSfxLocalJob } from "./AvantiqoSfxLocalQueueProvider.js";
import {
  finalizeAudioDurationGuard,
  parseAudioDurationGuardJobId,
} from "./AvantiqoAudioDurationGuard.js";

const MODAL_JOB_PREFIX = "modal-audio:";
const MODAL_APP_NAME = "avantiqo-audio-owned";
const MODAL_FUNCTION_NAME = "generate";
const MODAL_MAIN_CAPABILITIES = new Set([
  "ai.music.generate",
  "ai.audio.remix",
  "ai.audio.edit",
  "ai.audio.extend",
]);
// Avantiqo owns orchestration, auth, storage, usage context, duration quality
// control and job state. Modal is only the elastic GPU execution plane. There
// is deliberately no CPU Modal gateway in the primary Audio path.
const MODAL_GENERATION_WORKER = createAvantiqoOwnedModalWorker({
  providerId: "avantiqo-audio",
  family: "audio",
  engineContract: "AVANTIQO_AUDIO_ENGINE_V1",
  transportMode: "direct-sdk",
  jobPrefix: MODAL_JOB_PREFIX,
  appName: MODAL_APP_NAME,
  functionName: MODAL_FUNCTION_NAME,
  enabledEnv: "AVANTIQO_AUDIO_ENGINE_ENABLED",
  timeoutEnv: "AVANTIQO_AUDIO_ENGINE_TIMEOUT_MS",
  defaultModel: "avantiqo-audio-v1",
  outputExtension: "wav",
});

function text(value) { return String(value ?? "").trim(); }
function isSfxCapability(capability) { return text(capability) === "ai.sfx.generate"; }
function useLocalSfx(input = {}) {
  const executionClass = text(input.execution_class || input.executionClass).toLowerCase();
  return new Set(["background", "batch", "local_batch"]).has(executionClass);
}
function isSeparatorCapability(capability) { return text(capability) === "ai.audio.stems"; }
function isElasticCapability(capability) { return text(capability) === "ai.audio.elastic-warp"; }
function isVocalCorrectionCapability(capability) { return text(capability) === "ai.audio.vocal-correct"; }
function isModalMainCapability(capability) { return MODAL_MAIN_CAPABILITIES.has(text(capability)); }
function isModalJob(input = {}) {
  return text(input.job_id || input.jobId || input.provider_job_id).startsWith(MODAL_JOB_PREFIX);
}

export const AvantiqoAudioProvider = {
  id: "avantiqo-audio",
  async execute(input = {}) {
    if (isSfxCapability(input.capability)) {
      try {
        if (useLocalSfx(input) && await AvantiqoSfxLocalQueueProvider.available()) return await AvantiqoSfxLocalQueueProvider.execute(input);
      } catch (error) {
        if (String(process.env.AVANTIQO_LOCAL_COMPUTE_REQUIRED || "").trim().toLowerCase() === "true") throw error;
        console.error("AVANTIQO_SFX_LOCAL_FALLBACK_MODAL", { error: String(error?.message || error).slice(0, 500) });
      }
      return AvantiqoSfxModalProvider.execute(input);
    }
    if (isMusicGenerateCapability(input.capability)) {
      if (await AvantiqoMusicLocalNodeProvider.available("ai.music.generate")) return AvantiqoMusicLocalNodeProvider.execute(input);
      throw new Error("AVANTIQO_MUSIC_LOCAL_NODE_REQUIRED");
    }
    if (isExtendCapability(input.capability)) throw new Error("AVANTIQO_MUSIC_TEMPORAL_EXTEND_OUTPAINT_NOT_CERTIFIED");

    if (isModalMainCapability(input.capability)) {
      throw new Error(`AVANTIQO_AUDIO_LOCAL_ONLY_CAPABILITY_NOT_AVAILABLE:${text(input.capability)}`);
    }
    throw new Error(`AVANTIQO_AUDIO_LOCAL_CAPABILITY_NOT_IMPLEMENTED:${text(input.capability) || "UNKNOWN"}`);
  },
  async getStatus(input = {}) {
    const suppliedJobId = text(input.job_id || input.jobId || input.provider_job_id);
    if (isSfxLocalJob(suppliedJobId)) return AvantiqoSfxLocalQueueProvider.getStatus(input);
    if (suppliedJobId.startsWith(AVANTIQO_MUSIC_LOCAL_NODE_JOB_PREFIX)) return AvantiqoMusicLocalNodeProvider.getStatus(input);
    if (suppliedJobId.startsWith("modal-sfx:")) return AvantiqoSfxModalProvider.getStatus(input);
    if (isModalJob(input)) {
      const encodedJobId = text(input.job_id || input.jobId || input.provider_job_id);
      const parsed = parseAudioDurationGuardJobId(encodedJobId);
      const result = await MODAL_GENERATION_WORKER.getStatus({
        ...input,
        job_id: parsed.base_job_id,
        jobId: parsed.base_job_id,
        provider_job_id: parsed.base_job_id,
      });
      if (text(result?.status).toLowerCase() !== "completed") {
        return { ...result, provider_job_id: encodedJobId };
      }
      const finalized = await finalizeAudioDurationGuard({
        result,
        guard: parsed.guard,
        organizationId: text(input.context?.organization_id),
      });
      return { ...finalized, provider_job_id: encodedJobId };
    }
    throw new Error("AVANTIQO_AUDIO_MODAL_JOB_REQUIRED");
  },
};

export const AVANTIQO_AUDIO_MODAL_JOB_PREFIX = MODAL_JOB_PREFIX;
