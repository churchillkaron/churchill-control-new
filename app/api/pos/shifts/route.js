import { NextResponse } from "next/server";

import openShift from "@/lib/pos/shifts/openShift";

import closeShift from "@/lib/pos/shifts/closeShift";

export async function POST(req) {

  try {

    const body =
      await req.json();

    if (
      body.action ===
      "OPEN"
    ) {

      const result =
        await openShift(
          body
        );

      return NextResponse.json(
        result
      );
    }

    if (
      body.action ===
      "CLOSE"
    ) {

      const result =
        await closeShift(
          body
        );

      return NextResponse.json(
        result
      );
    }

    return NextResponse.json(
      {

        success: false,

        error:
          "INVALID_ACTION",
      },
      {

        status: 400,
      }
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
