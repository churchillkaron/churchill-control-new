import {
  executeIntelligenceModalDirect,
  getIntelligenceModalDirectStatus,
  cancelIntelligenceModalDirect,
  isIntelligenceModalDirectJob,
  AVANTIQO_INTELLIGENCE_MODAL_DIRECT_JOB_PREFIX,
} from "./AvantiqoIntelligenceModalDirectRuntime.js";

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
  scheduledExecutionAllowsExternalIntelligenceFallback,
  scheduledExecutionRequiresLocalIntelligence,
} from "../../policy/ScheduledExecutionComputePolicyRuntime.js";

function text(value) { return String(value ?? "").trim(); }

export const AvantiqoIntelligenceProviderV2 = {
  id: "avantiqo-intelligence",
  async execute(input = {}) {
    if (shouldUseLocalIntelligenceQueue(input)) {
      try {
        return await executeIntelligenceLocalQueue(input);
      } catch (error) {
        if (scheduledExecutionRequiresLocalIntelligence() || String(process.env.AVANTIQO_LOCAL_COMPUTE_REQUIRED || "").trim().toLowerCase() === "true") throw error;
        console.error("AVANTIQO_LOCAL_QUEUE_FALLBACK", {
          lane: String(input.execution_lane || input.executionLane || "").trim() || null,
          error: String(error?.message || error).slice(0, 500),
        });
      }
    }
    if (shouldUseLocalIntelligence(input)) {
      try {
        return await executeIntelligenceLocal(input);
      } catch (error) {
        if (scheduledExecutionRequiresLocalIntelligence() || String(process.env.AVANTIQO_LOCAL_COMPUTE_REQUIRED || "").trim().toLowerCase() === "true") throw error;
        console.error("AVANTIQO_LOCAL_INTELLIGENCE_FALLBACK_MODAL", {
          lane: String(input.execution_lane || input.executionLane || "").trim() || null,
          error: String(error?.message || error).slice(0, 500),
        });
      }
    }
    if (scheduledExecutionRequiresLocalIntelligence() && !scheduledExecutionAllowsExternalIntelligenceFallback()) {
      throw new Error("AVANTIQO_SCHEDULED_INTELLIGENCE_LOCAL_COMPUTE_REQUIRED");
    }
    return executeIntelligenceModalDirect(input);
  },
  async cancel(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    if (!jobId) throw new Error("AVANTIQO_INTELLIGENCE_JOB_ID_REQUIRED");
    if (isIntelligenceLocalQueueJob(jobId)) return cancelIntelligenceLocalQueue({ ...input, job_id: jobId });
    return cancelIntelligenceModalDirect({ ...input, job_id: jobId });
  },
  async getStatus(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    if (!jobId) throw new Error("AVANTIQO_INTELLIGENCE_JOB_ID_REQUIRED");
    if (isIntelligenceLocalQueueJob(jobId)) return getIntelligenceLocalQueueStatus(input);
    if (!isIntelligenceModalDirectJob(jobId)) {
      throw new Error("AVANTIQO_INTELLIGENCE_JOB_ID_UNSUPPORTED");
    }
    return getIntelligenceModalDirectStatus(input);
  },
};

export const AVANTIQO_INTELLIGENCE_MODAL_JOB_PREFIX = AVANTIQO_INTELLIGENCE_MODAL_DIRECT_JOB_PREFIX;
