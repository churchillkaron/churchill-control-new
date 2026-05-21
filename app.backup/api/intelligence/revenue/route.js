import { NextResponse } from "next/server";

import buildRevenueIntelligence from "@/lib/intelligence/revenue/buildRevenueIntelligence";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildRevenueIntelligence(
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
