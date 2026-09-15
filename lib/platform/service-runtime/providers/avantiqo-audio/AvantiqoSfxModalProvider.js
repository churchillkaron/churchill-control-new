import { createAvantiqoOwnedModalWorker } from "../avantiqo-owned/AvantiqoOwnedModalWorker.js";

const PROVIDER_ID = "avantiqo-audio";
const CAPABILITY = "ai.sfx.generate";
const PRODUCT_MODEL = "avantiqo-sfx-v1";
const FOUNDATION_MODEL = "OpenMOSS-Team/MOSS-SoundEffect-v2.0";
const APP_NAME = "avantiqo-sfx-owned";
const FUNCTION_NAME = "generate";
const JOB_PREFIX = "modal-sfx:";

function text(value) { return String(value ?? "").trim(); }
function enabled(value) { return ["1", "true", "yes", "on"].includes(text(value).toLowerCase()); }

const WORKER = createAvantiqoOwnedModalWorker({
  providerId: PROVIDER_ID,
  family: "sfx",
  engineContract: "AVANTIQO_SFX_ENGINE_V1",
  transportMode: "direct-sdk",
  jobPrefix: JOB_PREFIX,
  appName: APP_NAME,
  functionName: FUNCTION_NAME,
  enabledEnv: "AVANTIQO_SFX_ENGINE_ENABLED",
  timeoutEnv: "AVANTIQO_SFX_ENGINE_TIMEOUT_MS",
  defaultModel: PRODUCT_MODEL,
  outputExtension: "wav",
});

function assertCertified() {
  if (!enabled(process.env.AVANTIQO_SFX_ENGINE_CERTIFIED)) throw new Error("AVANTIQO_SFX_ENGINE_NOT_CERTIFIED");
}

export const AvantiqoSfxModalProvider = {
  id: PROVIDER_ID,
  async execute(input = {}) {
    if (text(input.capability) !== CAPABILITY) throw new Error(`AVANTIQO_SFX_CAPABILITY_NOT_SUPPORTED:${text(input.capability)}`);
    assertCertified();
    const result = await WORKER.execute(input);
    return { ...result, model: PRODUCT_MODEL, output: { ...(result?.output || {}), foundation_model: FOUNDATION_MODEL, infrastructure_provider: "MODAL_DIRECT_ASYNC_V1", raw_reasoning_persisted: false } };
  },
  async getStatus(input = {}) {
    assertCertified();
    return WORKER.getStatus(input);
  },
};

export const AVANTIQO_SFX_MODAL_JOB_PREFIX = JOB_PREFIX;
