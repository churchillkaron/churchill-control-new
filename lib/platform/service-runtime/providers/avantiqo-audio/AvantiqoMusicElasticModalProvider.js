import { createAvantiqoOwnedModalWorker } from "../avantiqo-owned/AvantiqoOwnedModalWorker.js";

export const AVANTIQO_MUSIC_ELASTIC_MODAL_JOB_PREFIX = "modal-music-elastic:";
const CAPABILITY = "ai.audio.elastic-warp";
function text(value) { return String(value ?? "").trim(); }
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value).toLowerCase()); }

const WORKER = createAvantiqoOwnedModalWorker({
  providerId: "avantiqo-audio",
  family: "music-elastic",
  engineContract: "AVANTIQO_MUSIC_ELASTIC_AUDIO_ENGINE_V1",
  transportMode: "direct-sdk",
  jobPrefix: AVANTIQO_MUSIC_ELASTIC_MODAL_JOB_PREFIX,
  appName: "avantiqo-music-elastic-owned",
  functionName: "render",
  enabledEnv: "AVANTIQO_MUSIC_ELASTIC_ENGINE_ENABLED",
  timeoutEnv: "AVANTIQO_MUSIC_ELASTIC_ENGINE_TIMEOUT_MS",
  defaultModel: "signalsmith-stretch",
  outputExtension: "wav",
});

function assertCertified() {
  if (!enabled(process.env.AVANTIQO_MUSIC_ELASTIC_ENGINE_CERTIFIED)) throw new Error("AVANTIQO_MUSIC_ELASTIC_ENGINE_NOT_CERTIFIED");
}

export const AvantiqoMusicElasticModalProvider = {
  id: "avantiqo-audio",
  async execute(input = {}) {
    if (text(input.capability) !== CAPABILITY) throw new Error(`AVANTIQO_MUSIC_ELASTIC_CAPABILITY_NOT_SUPPORTED:${text(input.capability)}`);
    assertCertified();
    return WORKER.execute(input);
  },
  async getStatus(input = {}) {
    assertCertified();
    return WORKER.getStatus(input);
  },
};
