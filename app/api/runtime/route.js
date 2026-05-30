import { NextResponse } from "next/server";

import runHeartbeat from "@/lib/runtime/infrastructure/runHeartbeat";

import runWatchdog from "@/lib/runtime/infrastructure/runWatchdog";

import runRecoveryEngine from "@/lib/runtime/infrastructure/runRecoveryEngine";

import runAutoscaling from "@/lib/runtime/infrastructure/runAutoscaling";

import runHealthMonitor from "@/lib/runtime/infrastructure/runHealthMonitor";

export async function POST() {

  try {

    const heartbeat =
      await runHeartbeat({

        worker_name:
          "PRIMARY_WORKER",
      });

    const watchdog =
      await runWatchdog();

    const recovery =
      await runRecoveryEngine({

        stuck_jobs:
          watchdog.stuck_jobs || [],
      });

    const autoscaling =
      await runAutoscaling();

    const health =
      await runHealthMonitor();

    return NextResponse.json({

      success: true,

      runtime: {

        heartbeat,

        watchdog,

        recovery,

        autoscaling,

        health,

        generated_at:
          new Date().toISOString(),
      },
    });

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    );
  }
}
