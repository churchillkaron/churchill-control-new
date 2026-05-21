import { NextResponse } from "next/server";

import buildFranchiseIntelligenceNetwork from "@/lib/intelligence/franchise/buildFranchiseIntelligenceNetwork";

export async function GET() {

  try {

    const result =
      await buildFranchiseIntelligenceNetwork();

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
