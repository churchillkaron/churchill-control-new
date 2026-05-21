import { NextResponse } from "next/server";

import runFullIntelligenceCycle from "@/lib/intelligence/orchestrator/runFullIntelligenceCycle";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await runFullIntelligenceCycle(
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
