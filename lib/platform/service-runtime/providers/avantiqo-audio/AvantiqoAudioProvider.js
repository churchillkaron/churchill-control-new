import { createAvantiqoOwnedModalWorker } from "../avantiqo-owned/AvantiqoOwnedModalWorker.js";
import { AvantiqoSfxModalProvider } from "./AvantiqoSfxModalProvider.js";
import { AvantiqoSfxLocalQueueProvider, isSfxLocalJob } from "./AvantiqoSfxLocalQueueProvider.js";
import { AvantiqoMusicSeparatorModalProvider, AVANTIQO_MUSIC_SEPARATOR_MODAL_JOB_PREFIX } from "./AvantiqoMusicSeparatorModalProvider.js";
import { AvantiqoMusicElasticModalProvider, AVANTIQO_MUSIC_ELASTIC_MODAL_JOB_PREFIX } from "./AvantiqoMusicElasticModalProvider.js";
import { AvantiqoMusicElasticLocalQueueProvider, isMusicElasticLocalJob } from "./AvantiqoMusicElasticLocalQueueProvider.js";
import { AvantiqoMusicVocalCorrectionModalProvider, AVANTIQO_MUSIC_VOCAL_CORRECTION_MODAL_JOB_PREFIX } from "./AvantiqoMusicVocalCorrectionModalProvider.js";
import { AvantiqoMusicLocalNodeProvider, AVANTIQO_MUSIC_LOCAL_NODE_JOB_PREFIX } from "./AvantiqoMusicLocalNodeProvider.js";
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
function isMusicGenerationCapability(capability) { return text(capability) === "ai.music.generate"; }
function isSeparatorCapability(capability) { return text(capability) === "ai.audio.stems"; }
function isElasticCapability(capability) { return text(capability) === "ai.audio.elastic-warp"; }
function isVocalCorrectionCapability(capability) { return text(capability) === "ai.audio.vocal-correct"; }
function isLocalResearchCapability(capability) { return ["ai.audio.vocal-role-separate", "ai.audio.singing-voice-convert"].includes(text(capability)); }
function isModalMainCapability(capability) { return MODAL_MAIN_CAPABILITIES.has(text(capability)); }
function isModalJob(input = {}) {
  return text(input.job_id || input.jobId || input.provider_job_id).startsWith(MODAL_JOB_PREFIX);
}

export const AvantiqoAudioProvider = {
  id: "avantiqo-audio",
  async execute(input = {}) {
    const localRequired =
      text(process.env.AVANTIQO_LOCAL_COMPUTE_REQUIRED).toLowerCase() === "true" ||
      input.metadata?.local_only === true ||
      input.provider_parameters?.local_only === true;
    if (isSfxCapability(input.capability)) {
      try {
        if (await AvantiqoSfxLocalQueueProvider.available()) {
          return await AvantiqoSfxLocalQueueProvider.execute(input);
        }
      } catch (error) {
        if (localRequired) throw error;
        console.error("AVANTIQO_SFX_LOCAL_FALLBACK_MODAL", { error: text(error?.message || error).slice(0, 500) });
      }
      return AvantiqoSfxModalProvider.execute(input);
    }
    if (isMusicGenerationCapability(input.capability) && await AvantiqoMusicLocalNodeProvider.available(input.capability)) {
      try { return await AvantiqoMusicLocalNodeProvider.execute(input); } catch (error) {
        if (input.metadata?.local_only === true || input.provider_parameters?.local_only === true) throw error;
      }
    }
    if (isSeparatorCapability(input.capability)) {
      if (await AvantiqoMusicLocalNodeProvider.available(input.capability)) {
        try { return await AvantiqoMusicLocalNodeProvider.execute(input); } catch (error) {
          if (input.metadata?.local_only === true || input.provider_parameters?.local_only === true) throw error;
        }
      }
      return AvantiqoMusicSeparatorModalProvider.execute(input);
    }
    if (isElasticCapability(input.capability)) {
      try {
        if (await AvantiqoMusicElasticLocalQueueProvider.available()) {
          return await AvantiqoMusicElasticLocalQueueProvider.execute(input);
        }
      } catch (error) {
        if (localRequired) throw error;
        console.error("AVANTIQO_MUSIC_ELASTIC_LOCAL_FALLBACK_MODAL", { error: text(error?.message || error).slice(0, 500) });
      }
      return AvantiqoMusicElasticModalProvider.execute(input);
    }
    if (isLocalResearchCapability(input.capability)) {
      if (input.metadata?.research_candidate !== true && input.provider_parameters?.research_candidate !== true) throw new Error(`AVANTIQO_AUDIO_RESEARCH_CAPABILITY_EXPLICIT_CANDIDATE_REQUIRED:${text(input.capability)}`);
      if (!await AvantiqoMusicLocalNodeProvider.available(input.capability)) throw new Error(`AVANTIQO_AUDIO_RESEARCH_CAPABILITY_LOCAL_RUNTIME_UNAVAILABLE:${text(input.capability)}`);
      return AvantiqoMusicLocalNodeProvider.execute({ ...input, provider_parameters: { ...(input.provider_parameters || {}), local_only: true, research_candidate: true } });
    }
    if (isVocalCorrectionCapability(input.capability)) {
      if (await AvantiqoMusicLocalNodeProvider.available(input.capability)) {
        try { return await AvantiqoMusicLocalNodeProvider.execute(input); } catch (error) {
          if (input.metadata?.local_only === true || input.provider_parameters?.local_only === true) throw error;
        }
      }
      return AvantiqoMusicVocalCorrectionModalProvider.execute(input);
    }

    if (modalDirectConfigured() && isModalMainCapability(input.capability)) {
      if (!isCertifiedMainCapability(input.capability)) throw new Error(`AVANTIQO_AUDIO_CAPABILITY_NOT_CERTIFIED:${text(input.capability)}`);
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
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    if (jobId.startsWith(AVANTIQO_MUSIC_LOCAL_NODE_JOB_PREFIX)) return AvantiqoMusicLocalNodeProvider.getStatus(input);
    if (isSfxLocalJob(jobId)) return AvantiqoSfxLocalQueueProvider.getStatus(input);
    if (isMusicElasticLocalJob(jobId)) return AvantiqoMusicElasticLocalQueueProvider.getStatus(input);
    if (jobId.startsWith("modal-sfx:")) return AvantiqoSfxModalProvider.getStatus(input);
    if (text(input.job_id || input.jobId || input.provider_job_id).startsWith(AVANTIQO_MUSIC_SEPARATOR_MODAL_JOB_PREFIX)) return AvantiqoMusicSeparatorModalProvider.getStatus(input);
    if (text(input.job_id || input.jobId || input.provider_job_id).startsWith(AVANTIQO_MUSIC_ELASTIC_MODAL_JOB_PREFIX)) return AvantiqoMusicElasticModalProvider.getStatus(input);
    if (text(input.job_id || input.jobId || input.provider_job_id).startsWith(AVANTIQO_MUSIC_VOCAL_CORRECTION_MODAL_JOB_PREFIX)) return AvantiqoMusicVocalCorrectionModalProvider.getStatus(input);
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
