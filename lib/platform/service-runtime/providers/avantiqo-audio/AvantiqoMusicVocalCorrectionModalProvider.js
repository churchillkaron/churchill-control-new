import { createAvantiqoOwnedModalWorker } from "../avantiqo-owned/AvantiqoOwnedModalWorker.js";

export const AVANTIQO_MUSIC_VOCAL_CORRECTION_MODAL_JOB_PREFIX = "modal-music-vocal-correction:";
const CAPABILITY = "ai.audio.vocal-correct";
function text(value) { return String(value ?? "").trim(); }
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value).toLowerCase()); }

const WORKER = createAvantiqoOwnedModalWorker({
  providerId: "avantiqo-audio",
  family: "music-vocal-correction",
  engineContract: "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2",
  transportMode: "direct-sdk",
  jobPrefix: AVANTIQO_MUSIC_VOCAL_CORRECTION_MODAL_JOB_PREFIX,
  appName: "avantiqo-music-vocal-correction-owned",
  functionName: "correct",
  enabledEnv: "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_ENABLED",
  timeoutEnv: "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_TIMEOUT_MS",
  defaultModel: "torchcrepe-full",
  outputTargets: {
    corrected_vocal_wav: "wav",
    correction_report_json: "json",
  },
});

function assertCertified() {
  if (!enabled(process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_CERTIFIED)) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_NOT_CERTIFIED");
}

export const AvantiqoMusicVocalCorrectionModalProvider = {
  id: "avantiqo-audio",
  async execute(input = {}) {
    if (text(input.capability) !== CAPABILITY) throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_CAPABILITY_NOT_SUPPORTED:${text(input.capability)}`);
    assertCertified();
    return WORKER.execute(input);
  },
  async getStatus(input = {}) {
    assertCertified();
    return WORKER.getStatus(input);
  },
};
