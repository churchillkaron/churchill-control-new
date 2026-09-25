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

const LOCAL_ROUTES = Object.freeze({
  "ai.music.generate": {
    provider: AvantiqoMusicGenerationLocalQueueProvider,
    unavailable: "AVANTIQO_MUSIC_GENERATION_LOCAL_NODE_UNAVAILABLE",
  },
  "ai.sfx.generate": {
    provider: AvantiqoSfxLocalQueueProvider,
    unavailable: "AVANTIQO_SFX_LOCAL_NODE_UNAVAILABLE",
  },
  "ai.audio.stems": {
    provider: AvantiqoMusicSeparatorLocalQueueProvider,
    unavailable: "AVANTIQO_MUSIC_SEPARATOR_LOCAL_NODE_UNAVAILABLE",
  },
  "ai.audio.vocal-correct": {
    provider: AvantiqoMusicVocalCorrectionLocalQueueProvider,
    unavailable: "AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_NODE_UNAVAILABLE",
  },
  "ai.audio.elastic-warp": {
    provider: AvantiqoMusicElasticLocalQueueProvider,
    unavailable: "AVANTIQO_MUSIC_ELASTIC_LOCAL_NODE_UNAVAILABLE",
  },
});

async function executeLocal(route, input) {
  if (!(await route.provider.available())) throw new Error(route.unavailable);
  return route.provider.execute(input);
}

export const AvantiqoAudioProvider = Object.freeze({
  id: "avantiqo-audio",
  local_only: true,

  async execute(input = {}) {
    const capability = text(input.capability);
    const route = LOCAL_ROUTES[capability];
    if (!route) throw new Error(`AVANTIQO_AUDIO_LOCAL_CAPABILITY_NOT_IMPLEMENTED:${capability || "UNKNOWN"}`);

    const prepared = capability === "ai.music.generate"
      ? prepareAudioDurationGuard(input)
      : { input, guard: null };
    const result = await executeLocal(route, prepared.input);
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
  },

  async getStatus(input = {}) {
    const encodedJobId = text(input.job_id || input.jobId || input.provider_job_id);
    const parsed = parseAudioDurationGuardJobId(encodedJobId);
    const jobId = parsed.base_job_id;
    const localInput = {
      ...input,
      job_id: jobId,
      jobId,
      provider_job_id: jobId,
    };

    let result;
    if (isMusicGenerationLocalJob(jobId)) result = await AvantiqoMusicGenerationLocalQueueProvider.getStatus(localInput);
    else if (isSfxLocalJob(jobId)) result = await AvantiqoSfxLocalQueueProvider.getStatus(localInput);
    else if (isMusicSeparatorLocalJob(jobId)) result = await AvantiqoMusicSeparatorLocalQueueProvider.getStatus(localInput);
    else if (isMusicVocalCorrectionLocalJob(jobId)) result = await AvantiqoMusicVocalCorrectionLocalQueueProvider.getStatus(localInput);
    else if (isMusicElasticLocalJob(jobId)) result = await AvantiqoMusicElasticLocalQueueProvider.getStatus(localInput);
    else throw new Error("AVANTIQO_AUDIO_LOCAL_JOB_ID_REQUIRED");

    if (text(result?.status).toLowerCase() !== "completed") {
      return { ...result, provider_job_id: encodedJobId };
    }
    const finalized = await finalizeAudioDurationGuard({
      result,
      guard: parsed.guard,
      organizationId: text(input.context?.organization_id),
    });
    return { ...finalized, provider_job_id: encodedJobId };
  },
});

export const AVANTIQO_AUDIO_LOCAL_ONLY = true;
