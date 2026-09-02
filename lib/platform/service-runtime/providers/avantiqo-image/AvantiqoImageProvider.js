import { createAvantiqoOwnedModalWorker } from "../avantiqo-owned/AvantiqoOwnedModalWorker.js";

export const AvantiqoImageProvider = createAvantiqoOwnedModalWorker({
  providerId: "avantiqo-image",
  family: "image",
  engineContract: "AVANTIQO_IMAGE_ENGINE_V1",
  transportMode: "direct-sdk",
  appName: "avantiqo-image-owned",
  functionName: "generate",
  environmentEnv: "AVANTIQO_MODAL_ENVIRONMENT",
  jobPrefix: "modal-image-direct:",
  enabledEnv: "AVANTIQO_IMAGE_ENGINE_ENABLED",
  timeoutEnv: "AVANTIQO_IMAGE_ENGINE_TIMEOUT_MS",
  defaultModel: "avantiqo-image-v1",
  outputExtension: "png",
  outputExtensions: {
    "ai.image.analyze": null,
  },
});