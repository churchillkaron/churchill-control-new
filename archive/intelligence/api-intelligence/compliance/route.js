import { NextResponse } from "next/server";

import buildAIComplianceGovernance from "@/lib/intelligence/compliance/buildAIComplianceGovernance";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildAIComplianceGovernance(
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
