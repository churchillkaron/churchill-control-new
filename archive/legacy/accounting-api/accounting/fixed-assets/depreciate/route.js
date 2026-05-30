import { NextResponse } from "next/server";

import { runAssetDepreciation } from "@/lib/finance/core/runAssetDepreciation";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await runAssetDepreciation({
        tenantId:
          body.tenantId,
        assetId:
          body.assetId,
        depreciationExpenseAccountId:
          body.depreciationExpenseAccountId,
        accumulatedDepreciationAccountId:
          body.accumulatedDepreciationAccountId,
        entryDate:
          body.entryDate,
      });

    return NextResponse.json({
      success: true,
      result,
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
