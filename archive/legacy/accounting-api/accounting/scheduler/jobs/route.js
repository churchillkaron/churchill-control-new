import { NextResponse } from "next/server";

import { getSchedulerJobs } from "@/lib/finance/core/getSchedulerJobs";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const jobs =
      await getSchedulerJobs({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      jobs,
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
