import { NextResponse } from "next/server";

import calculateInventoryValuation from "@/lib/warehouse/valuation/calculateInventoryValuation";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await calculateInventoryValuation(
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
