import { NextResponse } from "next/server";

import { configureTaxRule } from "@/lib/finance/core/configureTaxRule";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const config =
      await configureTaxRule({
        tenantId:
          body.tenantId,
        taxName:
          body.taxName,
        taxRate:
          body.taxRate,
        taxType:
          body.taxType,
        outputAccount:
          body.outputAccount,
        inputAccount:
          body.inputAccount,
      });

    return NextResponse.json({
      success: true,
      config,
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
