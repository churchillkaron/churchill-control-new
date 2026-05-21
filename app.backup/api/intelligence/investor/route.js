import { NextResponse } from "next/server";

import buildInvestorIntelligenceEngine from "@/lib/intelligence/investor/buildInvestorIntelligenceEngine";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildInvestorIntelligenceEngine(
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
