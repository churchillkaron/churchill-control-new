import { NextResponse } from "next/server";

import buildNeuralForecastEngine from "@/lib/intelligence/neural/buildNeuralForecastEngine";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildNeuralForecastEngine(
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
