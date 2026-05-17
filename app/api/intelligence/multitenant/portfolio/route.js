import { NextResponse } from "next/server";

import buildPortfolioOverview from "@/lib/intelligence/multitenant/buildPortfolioOverview";

export async function GET() {

  try {

    const result =
      await buildPortfolioOverview();

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
