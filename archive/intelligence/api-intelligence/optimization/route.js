import { NextResponse } from "next/server";

import buildAutonomousOptimizationEngine from "@/lib/intelligence/optimization/buildAutonomousOptimizationEngine";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildAutonomousOptimizationEngine(
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
