import { NextResponse } from "next/server";

import {
  loadPaymentState,
} from "@/lib/pos/payments/loadPaymentState";

export async function POST(req) {
  try {
    const body =
      await req.json();

    const state =
      await loadPaymentState({
        organizationId:
          body.organizationId,
        tableNumber:
          body.tableNumber,
      });

    return NextResponse.json({
      success: true,
      state,
    });
  } catch (error) {
    console.error(
      "LOAD PAYMENT STATE ERROR",
      error
    );

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
