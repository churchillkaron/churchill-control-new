import { AvantiqoCodeLocalQueueProvider, isCodeLocalJob, isCodeLocalCapability } from "./AvantiqoCodeLocalQueueProvider.js";

const PROVIDER_ID = "avantiqo-code";
function text(value) { return String(value ?? "").trim(); }

export const AvantiqoCodeProviderV2 = {
  id: PROVIDER_ID,
  async execute(input = {}) {
    if (!isCodeLocalCapability(input.capability)) {
      throw new Error(`AVANTIQO_CODE_LOCAL_CAPABILITY_NOT_SUPPORTED:${text(input.capability)}`);
    }
    if (!(await AvantiqoCodeLocalQueueProvider.available())) {
      throw new Error("AVANTIQO_CODE_LOCAL_NODE_UNAVAILABLE");
    }
    return AvantiqoCodeLocalQueueProvider.execute(input);
  },
  async getStatus(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    if (!isCodeLocalJob(jobId)) throw new Error("AVANTIQO_CODE_LOCAL_JOB_ID_REQUIRED");
    return AvantiqoCodeLocalQueueProvider.getStatus(input);
  },
};
