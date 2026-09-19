import { createAvantiqoOwnedModalWorker } from "../avantiqo-owned/AvantiqoOwnedModalWorker.js";
import { AvantiqoSfxModalProvider } from "./AvantiqoSfxModalProvider.js";
import { AvantiqoMusicSeparatorModalProvider, AVANTIQO_MUSIC_SEPARATOR_MODAL_JOB_PREFIX } from "./AvantiqoMusicSeparatorModalProvider.js";
import { AvantiqoMusicElasticModalProvider, AVANTIQO_MUSIC_ELASTIC_MODAL_JOB_PREFIX } from "./AvantiqoMusicElasticModalProvider.js";
import { AvantiqoMusicVocalCorrectionModalProvider, AVANTIQO_MUSIC_VOCAL_CORRECTION_MODAL_JOB_PREFIX } from "./AvantiqoMusicVocalCorrectionModalProvider.js";
import { AvantiqoMusicLocalNodeProvider, AVANTIQO_MUSIC_LOCAL_NODE_JOB_PREFIX } from "./AvantiqoMusicLocalNodeProvider.js";
import { AvantiqoMusicGenerationLocalQueueProvider, isMusicGenerationLocalJob } from "./AvantiqoMusicGenerationLocalQueueProvider.js";
import { AvantiqoSfxLocalQueueProvider, isSfxLocalJob } from "./AvantiqoSfxLocalQueueProvider.js";
import { AvantiqoMusicElasticLocalQueueProvider, isMusicElasticLocalJob } from "./AvantiqoMusicElasticLocalQueueProvider.js";
import { AvantiqoMusicSeparatorLocalQueueProvider, isMusicSeparatorLocalJob } from "./AvantiqoMusicSeparatorLocalQueueProvider.js";
import { AvantiqoMusicVocalCorrectionLocalQueueProvider, isMusicVocalCorrectionLocalJob } from "./AvantiqoMusicVocalCorrectionLocalQueueProvider.js";
import {
  prepareAudioDurationGuard,
  encodeAudioDurationGuardJobId,
  finalizeAudioDurationGuard,
  parseAudioDurationGuardJobId,
} from "./AvantiqoAudioDurationGuard.js";

const MODAL_JOB_PREFIX = "modal-audio:";
const MODAL_MAIN_CAPABILITIES = new Set([
  "ai.music.generate",
  "ai.audio.remix",
  "ai.audio.edit",
  "ai.audio.extend",
]);

const MODAL_GENERATION_WORKER = createAvantiqoOwnedModalWorker({
  providerId: "avantiqo-audio",
  family: "audio",
  engineContract: "AVANTIQO_AUDIO_ENGINE_V1",
  transportMode: "direct-sdk",
  jobPrefix: MODAL_JOB_PREFIX,
  appName: "avantiqo-audio-owned",
  functionName: "generate",
  enabledEnv: "AVANTIQO_AUDIO_ENGINE_ENABLED",
  timeoutEnv: "AVANTIQO_AUDIO_ENGINE_TIMEOUT_MS",
  defaultModel: "avantiqo-audio-v1",
  outputExtension: "wav",
});

function text(value) { return String(value ?? "").trim(); }
function isSfxCapability(value) { return text(value) === "ai.sfx.generate"; }
function isMusicGenerationCapability(value) { return text(value) === "ai.music.generate"; }
function isSeparatorCapability(value) { return text(value) === "ai.audio.stems"; }
function isElasticCapability(value) { return text(value) === "ai.audio.elastic-warp"; }
function isVocalCorrectionCapability(value) { return text(value) === "ai.audio.vocal-correct"; }
function isLocalResearchCapability(value) {
  return ["ai.audio.vocal-role-separate", "ai.audio.singing-voice-convert"].includes(text(value));
}
function isModalMainCapability(value) { return MODAL_MAIN_CAPABILITIES.has(text(value)); }
function localOnly(input = {}) {
  return input.infrastructure_policy === "local_only" ||
    input.local_compute_required === true ||
    input.metadata?.local_only === true ||
    input.provider_parameters?.local_only === true;
}
function isModalJob(input = {}) {
  return text(input.job_id || input.jobId || input.provider_job_id).startsWith(MODAL_JOB_PREFIX);
}

async function localOrApprovedModal({ input, localProvider, modalProvider, unavailableCode }) {
  if (await localProvider.available()) return localProvider.execute(input);
  if (localOnly(input)) throw new Error(unavailableCode);
  return modalProvider.execute(input);
}

export const AvantiqoAudioProvider = {
  id: "avantiqo-audio",

  async execute(input = {}) {
    const capability = text(input.capability);

    if (isMusicGenerationCapability(capability)) {
      if (await AvantiqoMusicGenerationLocalQueueProvider.available()) {
        return AvantiqoMusicGenerationLocalQueueProvider.execute(input);
      }
      if (localOnly(input)) throw new Error("AVANTIQO_MUSIC_GENERATION_LOCAL_NODE_REQUIRED");
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

    if (isSfxCapability(capability)) {
      return localOrApprovedModal({
        input,
        localProvider: AvantiqoSfxLocalQueueProvider,
        modalProvider: AvantiqoSfxModalProvider,
        unavailableCode: "AVANTIQO_SFX_LOCAL_NODE_REQUIRED",
      });
    }

    if (isSeparatorCapability(capability)) {
      return localOrApprovedModal({
        input,
        localProvider: AvantiqoMusicSeparatorLocalQueueProvider,
        modalProvider: AvantiqoMusicSeparatorModalProvider,
        unavailableCode: "AVANTIQO_MUSIC_SEPARATOR_LOCAL_NODE_REQUIRED",
      });
    }

    if (isElasticCapability(capability)) {
      return localOrApprovedModal({
        input,
        localProvider: AvantiqoMusicElasticLocalQueueProvider,
        modalProvider: AvantiqoMusicElasticModalProvider,
        unavailableCode: "AVANTIQO_MUSIC_ELASTIC_LOCAL_NODE_REQUIRED",
      });
    }

    if (isVocalCorrectionCapability(capability)) {
      return localOrApprovedModal({
        input,
        localProvider: AvantiqoMusicVocalCorrectionLocalQueueProvider,
        modalProvider: AvantiqoMusicVocalCorrectionModalProvider,
        unavailableCode: "AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_NODE_REQUIRED",
      });
    }

    if (isLocalResearchCapability(capability)) {
      if (input.metadata?.research_candidate !== true && input.provider_parameters?.research_candidate !== true) {
        throw new Error(`AVANTIQO_AUDIO_RESEARCH_CAPABILITY_EXPLICIT_CANDIDATE_REQUIRED:${capability}`);
      }
      if (!await AvantiqoMusicLocalNodeProvider.available(capability)) {
        throw new Error(`AVANTIQO_AUDIO_RESEARCH_CAPABILITY_LOCAL_RUNTIME_UNAVAILABLE:${capability}`);
      }
      return AvantiqoMusicLocalNodeProvider.execute({
        ...input,
        provider_parameters: {
          ...(input.provider_parameters || {}),
          local_only: true,
          research_candidate: true,
        },
      });
    }

    if (isModalMainCapability(capability)) {
      if (localOnly(input)) {
        throw new Error(`AVANTIQO_AUDIO_LOCAL_ONLY_CAPABILITY_NOT_AVAILABLE:${capability}`);
      }
      return MODAL_GENERATION_WORKER.execute(input);
    }

    throw new Error(`AVANTIQO_AUDIO_CAPABILITY_NOT_IMPLEMENTED:${capability || "UNKNOWN"}`);
  },

  async getStatus(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    if (isMusicGenerationLocalJob(jobId)) return AvantiqoMusicGenerationLocalQueueProvider.getStatus(input);
    if (jobId.startsWith(AVANTIQO_MUSIC_LOCAL_NODE_JOB_PREFIX)) return AvantiqoMusicLocalNodeProvider.getStatus(input);
    if (isSfxLocalJob(jobId)) return AvantiqoSfxLocalQueueProvider.getStatus(input);
    if (isMusicElasticLocalJob(jobId)) return AvantiqoMusicElasticLocalQueueProvider.getStatus(input);
    if (isMusicSeparatorLocalJob(jobId)) return AvantiqoMusicSeparatorLocalQueueProvider.getStatus(input);
    if (isMusicVocalCorrectionLocalJob(jobId)) return AvantiqoMusicVocalCorrectionLocalQueueProvider.getStatus(input);
    if (jobId.startsWith("modal-sfx:")) return AvantiqoSfxModalProvider.getStatus(input);
    if (jobId.startsWith(AVANTIQO_MUSIC_SEPARATOR_MODAL_JOB_PREFIX)) return AvantiqoMusicSeparatorModalProvider.getStatus(input);
    if (jobId.startsWith(AVANTIQO_MUSIC_ELASTIC_MODAL_JOB_PREFIX)) return AvantiqoMusicElasticModalProvider.getStatus(input);
    if (jobId.startsWith(AVANTIQO_MUSIC_VOCAL_CORRECTION_MODAL_JOB_PREFIX)) return AvantiqoMusicVocalCorrectionModalProvider.getStatus(input);
    if (isModalJob(input)) {
      const parsed = parseAudioDurationGuardJobId(jobId);
      const result = await MODAL_GENERATION_WORKER.getStatus({
        ...input,
        job_id: parsed.base_job_id,
        jobId: parsed.base_job_id,
        provider_job_id: parsed.base_job_id,
      });
      if (text(result?.status).toLowerCase() !== "completed") {
        return { ...result, provider_job_id: jobId };
      }
      const finalized = await finalizeAudioDurationGuard({
        result,
        guard: parsed.guard,
        organizationId: text(input.context?.organization_id),
      });
      return { ...finalized, provider_job_id: jobId };
    }
    throw new Error("AVANTIQO_AUDIO_JOB_ID_UNSUPPORTED");
  },
};

export const AVANTIQO_AUDIO_MODAL_JOB_PREFIX = MODAL_JOB_PREFIX;
