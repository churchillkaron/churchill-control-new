import { NextResponse } from "next/server";

import buildRevenueAnalytics from "@/lib/analytics/warehouse/buildRevenueAnalytics";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildRevenueAnalytics(
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
