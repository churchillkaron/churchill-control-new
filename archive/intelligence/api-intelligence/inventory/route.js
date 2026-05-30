import { NextResponse } from "next/server";

import buildInventoryForecastAI from "@/lib/intelligence/inventory/buildInventoryForecastAI";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildInventoryForecastAI(
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
