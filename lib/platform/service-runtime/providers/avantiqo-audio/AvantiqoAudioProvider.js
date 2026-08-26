import { createAvantiqoOwnedRunpodWorker } from "../avantiqo-owned/AvantiqoOwnedRunpodWorker.js";
import {
  AvantiqoMusicSeparatorProvider,
  AVANTIQO_MUSIC_SEPARATOR_JOB_PREFIX,
} from "./AvantiqoMusicSeparatorProvider.js";
import {
  AvantiqoMusicVocalCorrectionProvider,
  AVANTIQO_MUSIC_VOCAL_CORRECTION_JOB_PREFIX,
} from "./AvantiqoMusicVocalCorrectionProvider.js";
import {
  AvantiqoMusicExtendProvider,
  AVANTIQO_MUSIC_EXTEND_JOB_PREFIX,
} from "./AvantiqoMusicExtendProvider.js";

const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "audio";
const MUSIC_OWNED_WORKER_CAPABILITIES = new Set([
  "ai.music.generate",
  "ai.audio.remix",
  "ai.audio.edit",
  "ai.audio.mix",
  "ai.audio.master",
]);

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

function isVocalCorrectionCapability(capability) {
  return text(capability) === "ai.audio.vocal-correct";
}

function isExtendCapability(capability) {
  return text(capability) === "ai.audio.extend";
}

function isMusicOwnedWorkerCapability(capability) {
  return MUSIC_OWNED_WORKER_CAPABILITIES.has(text(capability));
}

function assertMusicSafeLease() {
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES") {
    throw new Error("AVANTIQO_MUSIC_PROVIDER_SAFE_LEASE_ACTIVE_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) {
    throw new Error("AVANTIQO_MUSIC_PROVIDER_SAFE_LEASE_CONTRACT_INVALID");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== SAFE_LEASE_LANE) {
    throw new Error("AVANTIQO_MUSIC_PROVIDER_SAFE_LEASE_LANE_INVALID");
  }

  const endpointId = text(process.env.RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID);
  const leasedEndpointId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID);
  if (!endpointId || !leasedEndpointId || leasedEndpointId !== endpointId) {
    throw new Error("AVANTIQO_MUSIC_PROVIDER_SAFE_LEASE_ENDPOINT_MISMATCH");
  }

  const expiresAt = Date.parse(text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error("AVANTIQO_MUSIC_PROVIDER_SAFE_LEASE_EXPIRED");
  }

  return {
    contract: SAFE_LEASE_CONTRACT,
    lane: SAFE_LEASE_LANE,
    endpoint_id: leasedEndpointId,
    expires_at: new Date(expiresAt).toISOString(),
  };
}

function isSeparatorJob(input = {}) {
  return text(input.job_id || input.jobId || input.provider_job_id)
    .startsWith(AVANTIQO_MUSIC_SEPARATOR_JOB_PREFIX);
}

function isVocalCorrectionJob(input = {}) {
  return text(input.job_id || input.jobId || input.provider_job_id)
    .startsWith(AVANTIQO_MUSIC_VOCAL_CORRECTION_JOB_PREFIX);
}

function isExtendJob(input = {}) {
  return text(input.job_id || input.jobId || input.provider_job_id)
    .startsWith(AVANTIQO_MUSIC_EXTEND_JOB_PREFIX);
}

export const AvantiqoAudioProvider = {
  id: "avantiqo-audio",

  async execute(input = {}) {
    if (isSeparatorCapability(input.capability)) {
      return AvantiqoMusicSeparatorProvider.execute(input);
    }
    if (isVocalCorrectionCapability(input.capability)) {
      return AvantiqoMusicVocalCorrectionProvider.execute(input);
    }
    if (isExtendCapability(input.capability)) {
      return AvantiqoMusicExtendProvider.execute(input);
    }
    if (isMusicOwnedWorkerCapability(input.capability)) {
      const lease = assertMusicSafeLease();
      const result = await GENERATION_WORKER.execute(input);
      return {
        ...result,
        output: {
          ...(result?.output || {}),
          safe_lease: lease,
        },
      };
    }
    return GENERATION_WORKER.execute(input);
  },

  async getStatus(input = {}) {
    if (isSeparatorJob(input)) {
      return AvantiqoMusicSeparatorProvider.getStatus(input);
    }
    if (isVocalCorrectionJob(input)) {
      return AvantiqoMusicVocalCorrectionProvider.getStatus(input);
    }
    if (isExtendJob(input)) {
      return AvantiqoMusicExtendProvider.getStatus(input);
    }
    return GENERATION_WORKER.getStatus(input);
  },
};
