import { AvantiqoMusicGenerationLocalQueueProvider, isMusicGenerationLocalJob } from "./AvantiqoMusicGenerationLocalQueueProvider.js";
import { AvantiqoSfxLocalQueueProvider, isSfxLocalJob } from "./AvantiqoSfxLocalQueueProvider.js";
import { AvantiqoMusicSeparatorLocalQueueProvider, isMusicSeparatorLocalJob } from "./AvantiqoMusicSeparatorLocalQueueProvider.js";
import { AvantiqoMusicElasticLocalQueueProvider, isMusicElasticLocalJob } from "./AvantiqoMusicElasticLocalQueueProvider.js";
import { AvantiqoMusicVocalCorrectionLocalQueueProvider, isMusicVocalCorrectionLocalJob } from "./AvantiqoMusicVocalCorrectionLocalQueueProvider.js";
import {
  encodeAudioDurationGuardJobId,
  finalizeAudioDurationGuard,
  parseAudioDurationGuardJobId,
  prepareAudioDurationGuard,
} from "./AvantiqoAudioDurationGuard.js";

function text(value) { return String(value ?? "").trim(); }

async function executeLocal(provider, input, unavailableCode) {
  if (!(await provider.available())) throw new Error(unavailableCode);
  return provider.execute(input);
}

export const AvantiqoAudioProvider = {
  id: "avantiqo-audio",
  async execute(input = {}) {
    const capability = text(input.capability);
    if (capability === "ai.music.generate") {
      const prepared = prepareAudioDurationGuard(input);
      const result = await executeLocal(AvantiqoMusicGenerationLocalQueueProvider, prepared.input, "AVANTIQO_MUSIC_GENERATION_LOCAL_NODE_UNAVAILABLE");
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
    if (capability === "ai.sfx.generate") return executeLocal(AvantiqoSfxLocalQueueProvider, input, "AVANTIQO_SFX_LOCAL_NODE_UNAVAILABLE");
    if (capability === "ai.audio.stems") return executeLocal(AvantiqoMusicSeparatorLocalQueueProvider, input, "AVANTIQO_MUSIC_SEPARATOR_LOCAL_NODE_UNAVAILABLE");
    if (capability === "ai.audio.elastic-warp") return executeLocal(AvantiqoMusicElasticLocalQueueProvider, input, "AVANTIQO_MUSIC_ELASTIC_LOCAL_NODE_UNAVAILABLE");
    if (capability === "ai.audio.vocal-correct") return executeLocal(AvantiqoMusicVocalCorrectionLocalQueueProvider, input, "AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_NODE_UNAVAILABLE");
    throw new Error(`AVANTIQO_AUDIO_LOCAL_CAPABILITY_NOT_IMPLEMENTED:${capability || "UNKNOWN"}`);
  },

  async cancel(input = {}) {
    const encodedJobId = text(input.job_id || input.jobId || input.provider_job_id);
    const parsed = parseAudioDurationGuardJobId(encodedJobId);
    const jobId = parsed.base_job_id;
    const baseInput = { ...input, job_id: jobId, jobId, provider_job_id: jobId };
    if (isMusicGenerationLocalJob(jobId)) return AvantiqoMusicGenerationLocalQueueProvider.cancel(baseInput);
    if (isSfxLocalJob(jobId)) return AvantiqoSfxLocalQueueProvider.cancel(input);
    if (isMusicSeparatorLocalJob(jobId)) return AvantiqoMusicSeparatorLocalQueueProvider.cancel(input);
    if (isMusicElasticLocalJob(jobId)) return AvantiqoMusicElasticLocalQueueProvider.cancel(input);
    if (isMusicVocalCorrectionLocalJob(jobId)) return AvantiqoMusicVocalCorrectionLocalQueueProvider.cancel(input);
    throw new Error("AVANTIQO_AUDIO_LOCAL_JOB_ID_REQUIRED");
  },

  async getStatus(input = {}) {
    const encodedJobId = text(input.job_id || input.jobId || input.provider_job_id);
    const parsed = parseAudioDurationGuardJobId(encodedJobId);
    const jobId = parsed.base_job_id;
    if (isMusicGenerationLocalJob(jobId)) {
      const result = await AvantiqoMusicGenerationLocalQueueProvider.getStatus({ ...input, job_id: jobId, jobId, provider_job_id: jobId });
      if (text(result?.status).toLowerCase() !== "completed") return { ...result, provider_job_id: encodedJobId };
      const finalized = await finalizeAudioDurationGuard({
        result,
        guard: parsed.guard,
        organizationId: text(input.context?.organization_id),
      });
      return { ...finalized, provider_job_id: encodedJobId };
    }
    if (isSfxLocalJob(jobId)) return AvantiqoSfxLocalQueueProvider.getStatus(input);
    if (isMusicSeparatorLocalJob(jobId)) return AvantiqoMusicSeparatorLocalQueueProvider.getStatus(input);
    if (isMusicElasticLocalJob(jobId)) return AvantiqoMusicElasticLocalQueueProvider.getStatus(input);
    if (isMusicVocalCorrectionLocalJob(jobId)) return AvantiqoMusicVocalCorrectionLocalQueueProvider.getStatus(input);
    throw new Error("AVANTIQO_AUDIO_LOCAL_JOB_ID_REQUIRED");
  },
};

export const AVANTIQO_AUDIO_MODAL_JOB_PREFIX = null;
