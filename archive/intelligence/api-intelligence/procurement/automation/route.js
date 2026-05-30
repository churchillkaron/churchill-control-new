import { NextResponse } from "next/server";

import buildAutonomousProcurementEngine from "@/lib/intelligence/procurement/automation/buildAutonomousProcurementEngine";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildAutonomousProcurementEngine(
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
