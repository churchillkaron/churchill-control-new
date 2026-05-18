import addJobToQueue from "@/lib/distributed/queues/addJobToQueue";

export default async function runScheduler({
  tenant_id,
}) {

  try {

    const scheduledJobs = [];

    // ===== DAILY AI =====
    const aiJob =
      await addJobToQueue({

        tenant_id,

        job_type:
          "AI_ORCHESTRATION",

        priority:
          "HIGH",

        payload: {

          schedule:
            "DAILY",
        },
      });

    scheduledJobs.push(
      aiJob.job
    );

    return {

      success: true,

      scheduled_jobs:
        scheduledJobs,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
