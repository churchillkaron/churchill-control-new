import { NextResponse } from "next/server";

import calculateExpiryDate from "@/lib/inventory/expiry/calculateExpiryDate";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      calculateExpiryDate(
        body
      );

    return NextResponse.json({

      success: true,

      ...result,
    });

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
