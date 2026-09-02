import { AvantiqoIntelligenceRunpodProvider as RunpodIntelligenceProvider } from "./AvantiqoIntelligenceRunpodProvider.js";
import {
  executeIntelligenceModalDirect,
  getIntelligenceModalDirectStatus,
  intelligenceModalDirectConfigured,
  isIntelligenceModalDirectJob,
  AVANTIQO_INTELLIGENCE_MODAL_DIRECT_JOB_PREFIX,
} from "./AvantiqoIntelligenceModalDirectRuntime.js";

function text(value) { return String(value ?? "").trim(); }

export const AvantiqoIntelligenceProviderV2 = {
  id: "avantiqo-intelligence",
  async execute(input = {}) {
    if (intelligenceModalDirectConfigured()) {
      return executeIntelligenceModalDirect(input);
    }
    return RunpodIntelligenceProvider.execute(input);
  },
  async getStatus(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    if (!jobId) throw new Error("AVANTIQO_INTELLIGENCE_JOB_ID_REQUIRED");
    if (isIntelligenceModalDirectJob(jobId)) {
      return getIntelligenceModalDirectStatus(input);
    }
    throw new Error("AVANTIQO_INTELLIGENCE_RUNPOD_PROVIDER_IS_SYNCHRONOUS");
  },
};

export const AVANTIQO_INTELLIGENCE_MODAL_JOB_PREFIX = AVANTIQO_INTELLIGENCE_MODAL_DIRECT_JOB_PREFIX;
