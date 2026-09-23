import { AvantiqoImageUpscaleLocalQueueProvider, isImageUpscaleLocalJob } from "./AvantiqoImageUpscaleLocalQueueProvider.js";
import { AvantiqoDocumentVisionLocalQueueProvider, isDocumentVisionLocalJob, isDocumentVisionLocalCapability } from "./AvantiqoDocumentVisionLocalQueueProvider.js";
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
const ownedImageAnalyzeWorker = createAvantiqoOwnedModalWorker({
  providerId: "avantiqo-image",
  family: "image",
  engineContract: "AVANTIQO_IMAGE_ENGINE_V1",
  transportMode: "direct-sdk",
  appName: "avantiqo-image-owned",
  functionName: "analyze",
  environmentEnv: "AVANTIQO_MODAL_ENVIRONMENT",
  jobPrefix: "modal-image-analyze-direct:",
  enabledEnv: "AVANTIQO_IMAGE_ENGINE_ENABLED",
  timeoutEnv: "AVANTIQO_IMAGE_ENGINE_TIMEOUT_MS",
  defaultModel: "Qwen/Qwen2.5-VL-7B-Instruct",
  outputExtension: null,
});
const ownedImageDepthWorker = createAvantiqoOwnedModalWorker({
  providerId: "avantiqo-image",
  family: "image",
  engineContract: "AVANTIQO_IMAGE_ENGINE_V1",
  transportMode: "direct-sdk",
  appName: "avantiqo-image-owned",
  functionName: "estimate_depth",
  environmentEnv: "AVANTIQO_MODAL_ENVIRONMENT",
  jobPrefix: "modal-image-depth-direct:",
  enabledEnv: "AVANTIQO_IMAGE_ENGINE_ENABLED",
  timeoutEnv: "AVANTIQO_IMAGE_ENGINE_TIMEOUT_MS",
  defaultModel: "avantiqo-depth-v1",
  outputExtension: "png",
});
const ownedImageMaterialWorker = createAvantiqoOwnedModalWorker({
  providerId: "avantiqo-image",
  family: "image",
  engineContract: "AVANTIQO_IMAGE_ENGINE_V1",
  transportMode: "direct-sdk",
  appName: "avantiqo-image-owned",
  functionName: "estimate_materials",
  environmentEnv: "AVANTIQO_MODAL_ENVIRONMENT",
  jobPrefix: "modal-image-material-direct:",
  enabledEnv: "AVANTIQO_IMAGE_ENGINE_ENABLED",
  timeoutEnv: "AVANTIQO_IMAGE_ENGINE_TIMEOUT_MS",
  defaultModel: "avantiqo-material-v1",
  outputExtension: null,
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
  async execute(input = {}) {
    const capability = String(input?.capability || "").trim().toLowerCase();
    const depthCapability = capability === "creative.depth.estimate";
    const materialCapability = capability === "creative.materials.estimate";
    const nonGenerativeCapability =
      capability === "ai.image.analyze" ||
      capability === "document.ocr" ||
      capability === "document.classify" ||
      depthCapability ||
      materialCapability;
    if (capability !== "ai.image.analyze" && !nonGenerativeCapability && String(process.env.AVANTIQO_STUDIO_VISUAL_GENERATION_ENABLED || "").trim() !== "1") {
      throw new Error("STUDIO_VISUAL_GENERATION_MASTER_LOCKED");
    }
    const normalized = normalizeDocumentVisionInput(input);
    const localRequired =
      String(process.env.AVANTIQO_LOCAL_COMPUTE_REQUIRED || "").trim().toLowerCase() === "true" ||
      input.metadata?.local_only === true ||
      input.provider_parameters?.local_only === true;
    if (isDocumentVisionLocalCapability(capability)) {
      try {
        const localCapability =
          isDocumentVisionLocalCapability(input.requested_capability)
            ? String(input.requested_capability).trim()
            : capability;
        if (await AvantiqoDocumentVisionLocalQueueProvider.available(localCapability)) {
          return await AvantiqoDocumentVisionLocalQueueProvider.execute({
            ...input,
            requested_capability: localCapability,
          });
        }
      } catch (error) {
        if (localRequired) throw error;
        console.error("AVANTIQO_IMAGE_ANALYZE_LOCAL_FALLBACK_MODAL", {
          capability,
          error: String(error?.message || error).slice(0, 500),
        });
      }
    }
    if (capability === "ai.image.upscale") {
      try {
        if (await AvantiqoImageUpscaleLocalQueueProvider.available()) {
          return await AvantiqoImageUpscaleLocalQueueProvider.execute(input);
        }
      } catch (error) {
        if (localRequired) throw error;
        console.error("AVANTIQO_IMAGE_UPSCALE_LOCAL_FALLBACK_MODAL", {
          error: String(error?.message || error).slice(0, 500),
        });
      }
    }
    if (depthCapability) return ownedImageDepthWorker.execute(input);
    if (materialCapability) return ownedImageMaterialWorker.execute(input);
    return nonGenerativeCapability
      ? ownedImageAnalyzeWorker.execute(normalized)
      : ownedImageWorker.execute(normalized);
  },
  async getStatus(input = {}) {
    const jobId = String(input.job_id || input.jobId || input.provider_job_id || "").trim();
    if (isDocumentVisionLocalJob(jobId)) return AvantiqoDocumentVisionLocalQueueProvider.getStatus(input);
    if (isImageUpscaleLocalJob(jobId)) return AvantiqoImageUpscaleLocalQueueProvider.getStatus(input);
    if (jobId.startsWith("modal-image-analyze-direct:")) return ownedImageAnalyzeWorker.getStatus(input);
    if (jobId.startsWith("modal-image-depth-direct:")) return ownedImageDepthWorker.getStatus(input);
    if (jobId.startsWith("modal-image-material-direct:")) return ownedImageMaterialWorker.getStatus(input);
    return ownedImageWorker.getStatus(input);
  },
};
