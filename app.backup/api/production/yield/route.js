import { NextResponse } from "next/server";

import processYieldCalculation from "@/lib/production/yield/processYieldCalculation";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await processYieldCalculation(
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
