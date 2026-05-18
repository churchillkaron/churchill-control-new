import { NextResponse } from "next/server";

import processPOSPayment from "@/lib/pos/payments/processPOSPayment";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await processPOSPayment(
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
