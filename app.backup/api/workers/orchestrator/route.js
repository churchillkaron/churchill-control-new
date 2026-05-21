import { NextResponse } from "next/server";

import runWorkerCycle from "@/lib/workers/orchestrator/runWorkerCycle";

export async function POST() {

  try {

    const result =
      await runWorkerCycle();

    return NextResponse.json(
      result
    );

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
