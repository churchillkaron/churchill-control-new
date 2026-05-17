import { NextResponse } from "next/server";

import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildExecutiveOverview(
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
