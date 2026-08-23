import { createAvantiqoOwnedRunpodWorker } from "../avantiqo-owned/AvantiqoOwnedRunpodWorker.js";

export const AvantiqoImageProvider = createAvantiqoOwnedRunpodWorker({
  providerId: "avantiqo-image",
  family: "image",
  engineContract: "AVANTIQO_IMAGE_ENGINE_V1",
  endpointEnv: "RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID",
  enabledEnv: "AVANTIQO_IMAGE_ENGINE_ENABLED",
  timeoutEnv: "AVANTIQO_IMAGE_ENGINE_TIMEOUT_MS",
  defaultModel: "avantiqo-image-v1",
  outputExtension: "png",
  outputExtensions: {
    "ai.image.analyze": null,
  },
});
