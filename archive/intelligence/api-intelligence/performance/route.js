import { NextResponse } from "next/server";

import buildPerformanceInsights from "@/lib/intelligence/performance/buildPerformanceInsights";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildPerformanceInsights(
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
