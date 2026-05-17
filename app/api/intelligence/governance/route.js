import { NextResponse } from "next/server";

import buildAIGovernanceEngine from "@/lib/intelligence/governance/buildAIGovernanceEngine";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildAIGovernanceEngine(
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
