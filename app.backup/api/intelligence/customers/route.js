import { NextResponse } from "next/server";

import buildCustomerLifetimeValueAI from "@/lib/intelligence/customers/buildCustomerLifetimeValueAI";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildCustomerLifetimeValueAI(
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
