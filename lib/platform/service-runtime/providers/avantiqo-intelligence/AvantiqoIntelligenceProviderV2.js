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
  AVANTIQO_INTELLIGENCE_LOCAL_MODEL,
} from "./AvantiqoIntelligenceLocalPolicy.js";
import {
  scheduledExecutionAllowsExternalIntelligenceFallback,
  scheduledExecutionRequiresLocalIntelligence,
} from "../../policy/ScheduledExecutionComputePolicyRuntime.js";
import {
  executeIntelligenceLocalQueue,
  getIntelligenceLocalQueueStatus,
  cancelIntelligenceLocalQueue,
  isIntelligenceLocalQueueJob,
  shouldUseLocalIntelligenceQueue,
} from "./AvantiqoIntelligenceLocalQueueRuntime.js";

function text(value) { return String(value ?? "").trim(); }
function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}
function localComputeRequired(input = {}) {
  const policy = text(
    input.infrastructure_policy ||
    input.infrastructurePolicy ||
    input.compute_policy ||
    input.computePolicy
  ).toLowerCase();
  return policy === "local_only"
    || enabled(input.local_compute_required ?? input.localComputeRequired)
    || enabled(process.env.AVANTIQO_LOCAL_COMPUTE_REQUIRED)
    || scheduledExecutionRequiresLocalIntelligence();
}

export const AvantiqoIntelligenceProviderV2 = {
  id: "avantiqo-intelligence",
  async execute(input = {}) {
    const selectedLocalModel = text(input.model) === AVANTIQO_INTELLIGENCE_LOCAL_MODEL;
    if (selectedLocalModel && shouldUseLocalIntelligenceQueue(input)) {
      try {
        return await executeIntelligenceLocalQueue(input);
      } catch (error) {
        if (localComputeRequired(input)) throw error;
        console.error("AVANTIQO_LOCAL_QUEUE_FALLBACK", {
          lane: String(input.execution_lane || input.executionLane || "").trim() || null,
          error: String(error?.message || error).slice(0, 500),
        });
      }
    }
    if (selectedLocalModel && shouldUseLocalIntelligence(input)) {
      try {
        return await executeIntelligenceLocal(input);
      } catch (error) {
        if (localComputeRequired(input)) throw error;
        console.error("AVANTIQO_LOCAL_INTELLIGENCE_FALLBACK_MODAL", {
          lane: String(input.execution_lane || input.executionLane || "").trim() || null,
          error: String(error?.message || error).slice(0, 500),
        });
      }
    }
    if (selectedLocalModel && localComputeRequired(input)) {
      throw new Error("AVANTIQO_LOCAL_COMPUTE_REQUIRED_UNAVAILABLE");
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
