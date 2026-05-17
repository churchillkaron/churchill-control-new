import { NextResponse } from "next/server";

import buildAutonomousComplianceEnforcement from "@/lib/intelligence/enforcement/buildAutonomousComplianceEnforcement";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildAutonomousComplianceEnforcement(
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
