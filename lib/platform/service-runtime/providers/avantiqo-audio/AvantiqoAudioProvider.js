import { createAvantiqoOwnedRunpodWorker } from "../avantiqo-owned/AvantiqoOwnedRunpodWorker.js";
import { createAvantiqoOwnedModalWorker } from "../avantiqo-owned/AvantiqoOwnedModalWorker.js";
import {
  AvantiqoMusicElasticAudioProvider,
  AVANTIQO_MUSIC_ELASTIC_JOB_PREFIX,
} from "./AvantiqoMusicElasticAudioProvider.js";
import {
  AvantiqoMusicSeparatorProvider,
  AVANTIQO_MUSIC_SEPARATOR_JOB_PREFIX,
} from "./AvantiqoMusicSeparatorProvider.js";
import {
  AvantiqoMusicVocalCorrectionProvider,
  AVANTIQO_MUSIC_VOCAL_CORRECTION_JOB_PREFIX,
} from "./AvantiqoMusicVocalCorrectionProvider.js";

const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "audio";
const MODAL_JOB_PREFIX = "modal-audio:";
const MODAL_APP_NAME = "avantiqo-audio-owned";
const MODAL_FUNCTION_NAME = "generate";
const MODAL_MAIN_CAPABILITIES = new Set([
  "ai.music.generate",
  "ai.audio.remix",
  "ai.audio.edit",
]);
const LEGACY_MAIN_CAPABILITIES = new Set([
  ...MODAL_MAIN_CAPABILITIES,
  "ai.audio.mix",
  "ai.audio.master",
]);

const RUNPOD_GENERATION_WORKER = createAvantiqoOwnedRunpodWorker({
  providerId: "avantiqo-audio",
  family: "audio",
  engineContract: "AVANTIQO_AUDIO_ENGINE_V1",
  endpointEnv: "RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID",
  enabledEnv: "AVANTIQO_AUDIO_ENGINE_ENABLED",
  timeoutEnv: "AVANTIQO_AUDIO_ENGINE_TIMEOUT_MS",
  defaultModel: "avantiqo-audio-v1",
  outputExtension: "wav",
});

// Avantiqo owns orchestration, auth, storage, usage context and job state.
// Modal is only the elastic GPU execution plane. There is deliberately no
// CPU Modal gateway in the primary Audio path.
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
function isSeparatorCapability(capability) { return text(capability) === "ai.audio.stems"; }
function isVocalCorrectionCapability(capability) { return text(capability) === "ai.audio.vocal-correct"; }
function isElasticCapability(capability) { return text(capability) === "ai.audio.elastic-warp"; }
function isExtendCapability(capability) { return text(capability) === "ai.audio.extend"; }
function isModalMainCapability(capability) { return MODAL_MAIN_CAPABILITIES.has(text(capability)); }
function isLegacyMainCapability(capability) { return LEGACY_MAIN_CAPABILITIES.has(text(capability)); }
function modalDirectConfigured() {
  const tokenId = text(process.env.MODAL_TOKEN_ID || process.env.AVANTIQO_MODAL_TOKEN_ID);
  const tokenSecret = text(process.env.MODAL_TOKEN_SECRET || process.env.AVANTIQO_MODAL_TOKEN_SECRET);
  return tokenId.length > 0 && tokenSecret.length > 0;
}

function assertMusicSafeLease() {
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES") throw new Error("AVANTIQO_MUSIC_PROVIDER_SAFE_LEASE_ACTIVE_REQUIRED");
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) throw new Error("AVANTIQO_MUSIC_PROVIDER_SAFE_LEASE_CONTRACT_INVALID");
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== SAFE_LEASE_LANE) throw new Error("AVANTIQO_MUSIC_PROVIDER_SAFE_LEASE_LANE_INVALID");
  const endpointId = text(process.env.RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID);
  const leasedEndpointId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID);
  if (!endpointId || !leasedEndpointId || leasedEndpointId !== endpointId) throw new Error("AVANTIQO_MUSIC_PROVIDER_SAFE_LEASE_ENDPOINT_MISMATCH");
  const expiresAt = Date.parse(text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error("AVANTIQO_MUSIC_PROVIDER_SAFE_LEASE_EXPIRED");
  return { contract: SAFE_LEASE_CONTRACT, lane: SAFE_LEASE_LANE, endpoint_id: leasedEndpointId, expires_at: new Date(expiresAt).toISOString() };
}

function isModalJob(input = {}) {
  return text(input.job_id || input.jobId || input.provider_job_id).startsWith(MODAL_JOB_PREFIX);
}
function isSeparatorJob(input = {}) { return text(input.job_id || input.jobId || input.provider_job_id).startsWith(AVANTIQO_MUSIC_SEPARATOR_JOB_PREFIX); }
function isVocalCorrectionJob(input = {}) { return text(input.job_id || input.jobId || input.provider_job_id).startsWith(AVANTIQO_MUSIC_VOCAL_CORRECTION_JOB_PREFIX); }
function isElasticJob(input = {}) { return text(input.job_id || input.jobId || input.provider_job_id).startsWith(AVANTIQO_MUSIC_ELASTIC_JOB_PREFIX); }

export const AvantiqoAudioProvider = {
  id: "avantiqo-audio",
  async execute(input = {}) {
    if (isSeparatorCapability(input.capability)) return AvantiqoMusicSeparatorProvider.execute(input);
    if (isVocalCorrectionCapability(input.capability)) return AvantiqoMusicVocalCorrectionProvider.execute(input);
    if (isElasticCapability(input.capability)) return AvantiqoMusicElasticAudioProvider.execute(input);
    if (isExtendCapability(input.capability)) throw new Error("AVANTIQO_MUSIC_TEMPORAL_EXTEND_OUTPAINT_NOT_CERTIFIED");

    if (modalDirectConfigured() && isModalMainCapability(input.capability)) {
      return MODAL_GENERATION_WORKER.execute(input);
    }
    if (isLegacyMainCapability(input.capability)) {
      const lease = assertMusicSafeLease();
      const result = await RUNPOD_GENERATION_WORKER.execute(input);
      return { ...result, output: { ...(result?.output || {}), safe_lease: lease } };
    }
    return RUNPOD_GENERATION_WORKER.execute(input);
  },
  async getStatus(input = {}) {
    if (isModalJob(input)) return MODAL_GENERATION_WORKER.getStatus(input);
    if (isSeparatorJob(input)) return AvantiqoMusicSeparatorProvider.getStatus(input);
    if (isVocalCorrectionJob(input)) return AvantiqoMusicVocalCorrectionProvider.getStatus(input);
    if (isElasticJob(input)) return AvantiqoMusicElasticAudioProvider.getStatus(input);
    return RUNPOD_GENERATION_WORKER.getStatus(input);
  },
};

export const AVANTIQO_AUDIO_MODAL_JOB_PREFIX = MODAL_JOB_PREFIX;
