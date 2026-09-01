import { createAvantiqoOwnedModalWorker } from "../avantiqo-owned/AvantiqoOwnedModalWorker.js";

export const AvantiqoImageProvider = createAvantiqoOwnedModalWorker({
  providerId: "avantiqo-image",
  family: "image",
  engineContract: "AVANTIQO_IMAGE_ENGINE_V1",
  baseUrlEnv: "AVANTIQO_IMAGE_MODAL_BASE_URL",
  tokenEnv: "AVANTIQO_IMAGE_MODAL_GATEWAY_TOKEN",
  enabledEnv: "AVANTIQO_IMAGE_ENGINE_ENABLED",
  timeoutEnv: "AVANTIQO_IMAGE_ENGINE_TIMEOUT_MS",
  defaultModel: "avantiqo-image-v1",
  outputExtension: "png",
  outputExtensions: {
    "ai.image.analyze": null,
  },
});
