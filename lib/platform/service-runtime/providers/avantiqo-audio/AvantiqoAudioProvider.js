import { createAvantiqoOwnedModalWorker } from "../avantiqo-owned/AvantiqoOwnedModalWorker.js";
import { AvantiqoSfxModalProvider } from "./AvantiqoSfxModalProvider.js";
import {
  encodeAudioDurationGuardJobId,
  finalizeAudioDurationGuard,
  parseAudioDurationGuardJobId,
  prepareAudioDurationGuard,
} from "./AvantiqoAudioDurationGuard.js";

const MODAL_JOB_PREFIX = "modal-audio:";
const MODAL_APP_NAME = "avantiqo-audio-owned";
const MODAL_FUNCTION_NAME = "generate";
const MODAL_MAIN_CAPABILITIES = new Set([
  "ai.music.generate",
  "ai.audio.remix",
  "ai.audio.edit",
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
function isExtendCapability(capability) { return text(capability) === "ai.audio.extend"; }
function isModalMainCapability(capability) { return MODAL_MAIN_CAPABILITIES.has(text(capability)); }
function modalDirectConfigured() {
  const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID);
  const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET);
  return tokenId.length > 0 && tokenSecret.length > 0;
}

function isModalJob(input = {}) {
  return text(input.job_id || input.jobId || input.provider_job_id).startsWith(MODAL_JOB_PREFIX);
}

export const AvantiqoAudioProvider = {
  id: "avantiqo-audio",
  async execute(input = {}) {
    if (isSfxCapability(input.capability)) return AvantiqoSfxModalProvider.execute(input);
    if (isExtendCapability(input.capability)) throw new Error("AVANTIQO_MUSIC_TEMPORAL_EXTEND_OUTPAINT_NOT_CERTIFIED");

    if (modalDirectConfigured() && isModalMainCapability(input.capability)) {
      const prepared = prepareAudioDurationGuard(input);
      const result = await MODAL_GENERATION_WORKER.execute(prepared.input);
      if (!prepared.guard) return result;
      const providerJobId = text(result?.output?.provider_job_id);
      if (!providerJobId) throw new Error("AVANTIQO_AUDIO_DURATION_GUARD_PROVIDER_JOB_REQUIRED");
      return {
        ...result,
        output: {
          ...(result.output || {}),
          provider_job_id: encodeAudioDurationGuardJobId(providerJobId, prepared.guard),
          duration_guard_contract: prepared.guard.contract,
          requested_duration_seconds: prepared.guard.requested_duration_seconds,
          generation_duration_seconds: prepared.guard.generation_duration_seconds,
          duration_guard_extra_gpu_jobs: 0,
        },
      };
    }
    throw new Error(`AVANTIQO_AUDIO_MODAL_CAPABILITY_NOT_IMPLEMENTED:${text(input.capability) || "UNKNOWN"}`);
  },
  async getStatus(input = {}) {
    if (text(input.job_id || input.jobId || input.provider_job_id).startsWith("modal-sfx:")) return AvantiqoSfxModalProvider.getStatus(input);
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
