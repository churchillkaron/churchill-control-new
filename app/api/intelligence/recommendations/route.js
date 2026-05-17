import { NextResponse } from "next/server";

import buildOperationalRecommendations from "@/lib/intelligence/recommendations/buildOperationalRecommendations";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildOperationalRecommendations(
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
