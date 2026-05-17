import { NextResponse } from "next/server";

import buildDemandForecast from "@/lib/intelligence/forecasting/buildDemandForecast";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildDemandForecast(
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
