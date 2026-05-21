import { NextResponse } from "next/server";

import buildPredictiveStaffing from "@/lib/intelligence/staffing/buildPredictiveStaffing";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildPredictiveStaffing(
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
