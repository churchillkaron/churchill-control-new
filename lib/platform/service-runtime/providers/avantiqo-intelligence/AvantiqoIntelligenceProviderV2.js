import {
  executeIntelligenceModalDirect,
  getIntelligenceModalDirectStatus,
  intelligenceModalDirectConfigured,
  isIntelligenceModalDirectJob,
  AVANTIQO_INTELLIGENCE_MODAL_DIRECT_JOB_PREFIX,
} from "./AvantiqoIntelligenceModalDirectRuntime.js";

function text(value) { return String(value ?? "").trim(); }

function requireModalDirect() {
  if (!intelligenceModalDirectConfigured()) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_DIRECT_CONFIGURATION_REQUIRED");
  }
}

export const AvantiqoIntelligenceProviderV2 = {
  id: "avantiqo-intelligence",
  async execute(input = {}) {
    requireModalDirect();
    return executeIntelligenceModalDirect(input);
  },
  async getStatus(input = {}) {
    requireModalDirect();
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    if (!jobId) throw new Error("AVANTIQO_INTELLIGENCE_JOB_ID_REQUIRED");
    if (!isIntelligenceModalDirectJob(jobId)) {
      throw new Error("AVANTIQO_INTELLIGENCE_MODAL_DIRECT_JOB_ID_REQUIRED");
    }
    return getIntelligenceModalDirectStatus(input);
  },
};

export const AVANTIQO_INTELLIGENCE_MODAL_JOB_PREFIX = AVANTIQO_INTELLIGENCE_MODAL_DIRECT_JOB_PREFIX;
