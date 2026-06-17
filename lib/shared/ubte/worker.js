import { getNextJob, updateJob } from "@/lib/shared/ubte/queue";

/**
 * UBTE QUEUE WORKER
 * Processes background jobs safely
 */

export async function startUBTEWorker(executor) {
  setInterval(async () => {
    const job = getNextJob();

    if (!job) return;

    try {
      updateJob(job.id, { status: "running" });

      const result = await executor(job);

      updateJob(job.id, {
        status: "done",
        result
      });

    } catch (err) {
      job.attempts += 1;

      if (job.attempts >= 3) {
        updateJob(job.id, {
          status: "failed",
          error: err.message
        });
      } else {
        updateJob(job.id, {
          status: "pending"
        });
      }
    }
  }, 1000);
}
