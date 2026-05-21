import { NextResponse } from "next/server";

import buildMarketingOptimizationAI from "@/lib/intelligence/marketing/buildMarketingOptimizationAI";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildMarketingOptimizationAI(
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
