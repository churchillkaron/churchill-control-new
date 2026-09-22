import { AvantiqoMusicGenerationLocalQueueProvider, isMusicGenerationLocalJob } from "./AvantiqoMusicGenerationLocalQueueProvider.js";
import { AvantiqoSfxLocalQueueProvider, isSfxLocalJob } from "./AvantiqoSfxLocalQueueProvider.js";
import { AvantiqoMusicSeparatorLocalQueueProvider, isMusicSeparatorLocalJob } from "./AvantiqoMusicSeparatorLocalQueueProvider.js";
import { AvantiqoMusicElasticLocalQueueProvider, isMusicElasticLocalJob } from "./AvantiqoMusicElasticLocalQueueProvider.js";
import { AvantiqoMusicVocalCorrectionLocalQueueProvider, isMusicVocalCorrectionLocalJob } from "./AvantiqoMusicVocalCorrectionLocalQueueProvider.js";

function text(value) { return String(value ?? "").trim(); }

async function executeLocal(provider, input, unavailableCode) {
  if (!(await provider.available())) throw new Error(unavailableCode);
  return provider.execute(input);
}

export const AvantiqoAudioProvider = {
  id: "avantiqo-audio",
  async execute(input = {}) {
    const capability = text(input.capability);
    if (capability === "ai.music.generate") return executeLocal(AvantiqoMusicGenerationLocalQueueProvider, input, "AVANTIQO_MUSIC_GENERATION_LOCAL_NODE_UNAVAILABLE");
    if (capability === "ai.sfx.generate") return executeLocal(AvantiqoSfxLocalQueueProvider, input, "AVANTIQO_SFX_LOCAL_NODE_UNAVAILABLE");
    if (capability === "ai.audio.stems") return executeLocal(AvantiqoMusicSeparatorLocalQueueProvider, input, "AVANTIQO_MUSIC_SEPARATOR_LOCAL_NODE_UNAVAILABLE");
    if (capability === "ai.audio.elastic-warp") return executeLocal(AvantiqoMusicElasticLocalQueueProvider, input, "AVANTIQO_MUSIC_ELASTIC_LOCAL_NODE_UNAVAILABLE");
    if (capability === "ai.audio.vocal-correct") return executeLocal(AvantiqoMusicVocalCorrectionLocalQueueProvider, input, "AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_NODE_UNAVAILABLE");
    throw new Error(`AVANTIQO_AUDIO_LOCAL_CAPABILITY_NOT_IMPLEMENTED:${capability || "UNKNOWN"}`);
  },
  async getStatus(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    if (isMusicGenerationLocalJob(jobId)) return AvantiqoMusicGenerationLocalQueueProvider.getStatus(input);
    if (isSfxLocalJob(jobId)) return AvantiqoSfxLocalQueueProvider.getStatus(input);
    if (isMusicSeparatorLocalJob(jobId)) return AvantiqoMusicSeparatorLocalQueueProvider.getStatus(input);
    if (isMusicElasticLocalJob(jobId)) return AvantiqoMusicElasticLocalQueueProvider.getStatus(input);
    if (isMusicVocalCorrectionLocalJob(jobId)) return AvantiqoMusicVocalCorrectionLocalQueueProvider.getStatus(input);
    throw new Error("AVANTIQO_AUDIO_LOCAL_JOB_ID_REQUIRED");
  },
};

export const AVANTIQO_AUDIO_MODAL_JOB_PREFIX = null;
