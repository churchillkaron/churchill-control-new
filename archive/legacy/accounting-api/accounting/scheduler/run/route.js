import { NextResponse } from "next/server";

import { runScheduledJob } from "@/lib/finance/core/runScheduledJob";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await runScheduledJob({
        tenantId:
          body.tenantId,
        jobId:
          body.jobId,
      });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error.message,
      },
      {
        status: 400,
      }
    );
  }
}
