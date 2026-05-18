import runWatchdog from "@/lib/runtime/watchdog/runWatchdog";

import runAutoscaling from "@/lib/runtime/autoscaling/runAutoscaling";

export default async function runHealthMonitor() {

  try {

    const watchdog =
      await runWatchdog();

    const autoscaling =
      await runAutoscaling();

    return {

      success: true,

      health: {

        stuck_jobs:
          watchdog.stuck_jobs
            ?.length || 0,

        pending_jobs:
          autoscaling.pending_jobs,

        recommended_workers:
          autoscaling.recommended_workers,

        runtime_status:
          watchdog.stuck_jobs
            ?.length > 5
            ? "WARNING"
            : "HEALTHY",
      },
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
