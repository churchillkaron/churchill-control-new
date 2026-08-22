import { createAvantiqoOwnedRunpodWorker } from "../avantiqo-owned/AvantiqoOwnedRunpodWorker.js";

export const AvantiqoCodeProvider = createAvantiqoOwnedRunpodWorker({
  providerId: "avantiqo-code",
  family: "code",
  engineContract: "AVANTIQO_CODE_ENGINE_V1",
  endpointEnv: "RUNPOD_AVANTIQO_CODE_ENDPOINT_ID",
  enabledEnv: "AVANTIQO_CODE_ENGINE_ENABLED",
  timeoutEnv: "AVANTIQO_CODE_ENGINE_TIMEOUT_MS",
  defaultModel: "avantiqo-code-v1",
  outputExtension: null,
});
