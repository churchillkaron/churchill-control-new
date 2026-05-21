import { NextResponse } from "next/server";

import buildExecutiveMobileDashboard from "@/lib/mobile/executive/buildExecutiveMobileDashboard";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildExecutiveMobileDashboard(
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
