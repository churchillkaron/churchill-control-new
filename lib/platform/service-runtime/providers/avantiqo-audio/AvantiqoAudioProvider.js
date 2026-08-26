import { createAvantiqoOwnedRunpodWorker } from "../avantiqo-owned/AvantiqoOwnedRunpodWorker.js";
import {
  AvantiqoMusicSeparatorProvider,
  AVANTIQO_MUSIC_SEPARATOR_JOB_PREFIX,
} from "./AvantiqoMusicSeparatorProvider.js";

const GENERATION_WORKER = createAvantiqoOwnedRunpodWorker({
  providerId: "avantiqo-audio",
  family: "audio",
  engineContract: "AVANTIQO_AUDIO_ENGINE_V1",
  endpointEnv: "RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID",
  enabledEnv: "AVANTIQO_AUDIO_ENGINE_ENABLED",
  timeoutEnv: "AVANTIQO_AUDIO_ENGINE_TIMEOUT_MS",
  defaultModel: "avantiqo-audio-v1",
  outputExtension: "wav",
});

function text(value) {
  return String(value ?? "").trim();
}

function isSeparatorCapability(capability) {
  return text(capability) === "ai.audio.stems";
}

function isSeparatorJob(input = {}) {
  return text(input.job_id || input.jobId || input.provider_job_id)
    .startsWith(AVANTIQO_MUSIC_SEPARATOR_JOB_PREFIX);
}

export const AvantiqoAudioProvider = {
  id: "avantiqo-audio",

  async execute(input = {}) {
    if (isSeparatorCapability(input.capability)) {
      return AvantiqoMusicSeparatorProvider.execute(input);
    }
    return GENERATION_WORKER.execute(input);
  },

  async getStatus(input = {}) {
    if (isSeparatorJob(input)) {
      return AvantiqoMusicSeparatorProvider.getStatus(input);
    }
    return GENERATION_WORKER.getStatus(input);
  },
};
