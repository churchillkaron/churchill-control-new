import { createAvantiqoOwnedModalWorker } from "../avantiqo-owned/AvantiqoOwnedModalWorker.js";

const ownedImageWorker = createAvantiqoOwnedModalWorker({
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
    "document.ocr": null,
    "document.classify": null,
  },
});
function normalizeDocumentVisionInput(input = {}) {
  const capability = String(input.capability || "").trim();
  if (!["document.ocr", "document.classify"].includes(capability)) return input;
  const task = capability === "document.ocr"
    ? "Extract all visible document text faithfully and return strict JSON with text, fields, and confidence. Do not invent missing content."
    : "Classify this document from visible evidence and return strict JSON with document_type, confidence, candidate_domains, and extracted key fields. Do not guess when evidence is weak.";
  return {
    ...input,
    capability: "ai.image.analyze",
    instructions: input.instructions || input.instructions_text || task,
    metadata: {
      ...(input.metadata || {}),
      requested_capability: capability,
      execution_capability: "ai.image.analyze",
      owned_document_vision_contract: "AVANTIQO_OWNED_DOCUMENT_VISION_V1",
    },
  };
}

export const AvantiqoImageProvider = {
  ...ownedImageWorker,
  execute(input = {}) {
    return ownedImageWorker.execute(normalizeDocumentVisionInput(input));
  },
};
