import {
  executeIntelligenceLocal,
  shouldUseLocalIntelligence,
} from "./AvantiqoIntelligenceLocalRuntime.js";
import {
  executeIntelligenceLocalQueue,
  getIntelligenceLocalQueueStatus,
  cancelIntelligenceLocalQueue,
  isIntelligenceLocalQueueJob,
  shouldUseLocalIntelligenceQueue,
} from "./AvantiqoIntelligenceLocalQueueRuntime.js";
import {
  executeHierarchicalLocalIntelligence,
  shouldUseHierarchicalLocalIntelligence,
} from "./AvantiqoIntelligenceHierarchicalLocalRuntime.js";

function text(value) { return String(value ?? "").trim(); }

export const AvantiqoIntelligenceProviderV2 = {
  id: "avantiqo-intelligence",
  async execute(input = {}) {
    if (shouldUseHierarchicalLocalIntelligence(input)) return executeHierarchicalLocalIntelligence(input);
    if (shouldUseLocalIntelligenceQueue(input)) return executeIntelligenceLocalQueue(input);
    if (shouldUseLocalIntelligence(input)) return executeIntelligenceLocal(input);
    throw new Error("AVANTIQO_INTELLIGENCE_LOCAL_NODE_REQUIRED");
  },
  async cancel(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    if (!jobId) throw new Error("AVANTIQO_INTELLIGENCE_JOB_ID_REQUIRED");
    if (!isIntelligenceLocalQueueJob(jobId)) throw new Error("AVANTIQO_INTELLIGENCE_LOCAL_JOB_ID_REQUIRED");
    return cancelIntelligenceLocalQueue({ ...input, job_id: jobId });
  },
  async getStatus(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    if (!jobId) throw new Error("AVANTIQO_INTELLIGENCE_JOB_ID_REQUIRED");
    if (!isIntelligenceLocalQueueJob(jobId)) throw new Error("AVANTIQO_INTELLIGENCE_LOCAL_JOB_ID_REQUIRED");
    return getIntelligenceLocalQueueStatus(input);
  },
};
