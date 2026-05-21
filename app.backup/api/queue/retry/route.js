import { NextResponse } from "next/server";

import retryFailedJobs from "@/lib/queue/retries/retryFailedJobs";

export async function POST() {

  try {

    const result =
      await retryFailedJobs();

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
