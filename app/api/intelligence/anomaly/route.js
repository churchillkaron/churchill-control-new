import { NextResponse } from "next/server";

import buildPredictiveAnomalyEngine from "@/lib/intelligence/anomaly/buildPredictiveAnomalyEngine";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildPredictiveAnomalyEngine(
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
