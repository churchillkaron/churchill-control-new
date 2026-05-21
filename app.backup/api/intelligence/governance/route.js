import { NextResponse } from "next/server";

import buildAutonomousFinancialGovernance from "@/lib/intelligence/governance/buildAutonomousFinancialGovernance";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildAutonomousFinancialGovernance(
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
