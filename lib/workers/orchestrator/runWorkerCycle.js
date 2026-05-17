import retryFailedJobs from "@/lib/queue/retries/retryFailedJobs";
import processAiTasks from "@/lib/workers/processAiTasks";
import createHealthSnapshot from "@/lib/monitoring/createHealthSnapshot";

export default async function runWorkerCycle() {

  const startedAt =
    new Date().toISOString();

  const retries =
    await retryFailedJobs();

  const ai =
    await processAiTasks();

  const monitoring =
    await createHealthSnapshot();

  return {
    success: true,
    started_at:
      startedAt,
    completed_at:
      new Date().toISOString(),
    retries,
    ai,
    monitoring,
  };
}
