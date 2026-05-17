import { NextResponse } from "next/server";

import runNightlyOwnerCycle from "@/lib/intelligence/agents/workers/runNightlyOwnerCycle";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await runNightlyOwnerCycle(
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
