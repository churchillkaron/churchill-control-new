import { NextResponse } from "next/server";

import { calculateTax } from "@/lib/finance/core/calculateTax";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const tax =
      await calculateTax({
        tenantId:
          body.tenantId,
        referenceType:
          body.referenceType,
        referenceId:
          body.referenceId,
        taxableAmount:
          body.taxableAmount,
        taxName:
          body.taxName,
      });

    return NextResponse.json({
      success: true,
      tax,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error.message,
      },
      {
        status: 400,
      }
    );
  }
}
