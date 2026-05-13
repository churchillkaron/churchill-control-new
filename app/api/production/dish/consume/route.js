import { NextResponse } from "next/server";

import { consumeDishStock } from "@/lib/production/consumeDishStock";

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      tenantId,
      dishId,
      quantity,
      referenceId,
    } = body;

    const result = await consumeDishStock({
      tenantId,
      dishId,
      quantity,
      referenceId,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error(
      "DISH CONSUMPTION API ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
