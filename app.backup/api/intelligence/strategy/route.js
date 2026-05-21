import { NextResponse } from "next/server";

import buildAIStrategicPlanningEngine from "@/lib/intelligence/strategy/buildAIStrategicPlanningEngine";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildAIStrategicPlanningEngine(
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
