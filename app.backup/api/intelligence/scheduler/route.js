import { NextResponse } from "next/server";

import buildAutonomousStaffScheduler from "@/lib/intelligence/scheduler/buildAutonomousStaffScheduler";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildAutonomousStaffScheduler(
        body
      );

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
