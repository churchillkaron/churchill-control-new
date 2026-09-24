import { AvantiqoImageGenerateLocalQueueProvider, isImageGenerateLocalJob } from "./AvantiqoImageGenerateLocalQueueProvider.js";
import { AvantiqoImageUpscaleLocalQueueProvider, isImageUpscaleLocalJob } from "./AvantiqoImageUpscaleLocalQueueProvider.js";
import { AvantiqoDocumentVisionLocalQueueProvider, isDocumentVisionLocalJob } from "./AvantiqoDocumentVisionLocalQueueProvider.js";

function text(value) { return String(value ?? "").trim(); }

async function requireLocal(provider, errorCode) {
  if (!(await provider.available())) throw new Error(errorCode);
  return provider;
}

export const AvantiqoImageProvider = {
  id: "avantiqo-image",
  async execute(input = {}) {
    const capability = text(input.capability).toLowerCase();
    if (["ai.image.analyze", "document.ocr", "document.classify", "creative.materials.estimate"].includes(capability)) {
      const provider = await requireLocal(AvantiqoDocumentVisionLocalQueueProvider, "AVANTIQO_DOCUMENT_VISION_LOCAL_NODE_UNAVAILABLE");
      return provider.execute(input);
    }
    if (capability === "ai.image.generate") {
      if (text(process.env.AVANTIQO_STUDIO_VISUAL_GENERATION_ENABLED) !== "1") throw new Error("STUDIO_VISUAL_GENERATION_MASTER_LOCKED");
      const provider = await requireLocal(AvantiqoImageGenerateLocalQueueProvider, "AVANTIQO_IMAGE_GENERATE_LOCAL_NODE_UNAVAILABLE");
      return provider.execute(input);
    }
    if (capability === "ai.image.upscale") {
      const provider = await requireLocal(AvantiqoImageUpscaleLocalQueueProvider, "AVANTIQO_IMAGE_UPSCALE_LOCAL_NODE_UNAVAILABLE");
      return provider.execute(input);
    }
    throw new Error(`AVANTIQO_IMAGE_LOCAL_CAPABILITY_NOT_IMPLEMENTED:${capability || "UNKNOWN"}`);
  },
  async cancel(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    if (isImageGenerateLocalJob(jobId)) return AvantiqoImageGenerateLocalQueueProvider.cancel(input);
    throw new Error("AVANTIQO_IMAGE_LOCAL_CANCEL_JOB_ID_REQUIRED");
  },
  async getStatus(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    if (isImageGenerateLocalJob(jobId)) return AvantiqoImageGenerateLocalQueueProvider.getStatus(input);
    if (isDocumentVisionLocalJob(jobId)) return AvantiqoDocumentVisionLocalQueueProvider.getStatus(input);
    if (isImageUpscaleLocalJob(jobId)) return AvantiqoImageUpscaleLocalQueueProvider.getStatus(input);
    throw new Error("AVANTIQO_IMAGE_LOCAL_JOB_ID_REQUIRED");
  },
};
