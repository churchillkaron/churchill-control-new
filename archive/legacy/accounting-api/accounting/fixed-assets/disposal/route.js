import { NextResponse } from "next/server";

import { disposeFixedAsset } from "@/lib/finance/core/disposeFixedAsset";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const disposal =
      await disposeFixedAsset({
        tenantId:
          body.tenantId,
        assetId:
          body.assetId,
        disposalDate:
          body.disposalDate,
        disposalAmount:
          body.disposalAmount,
      });

    return NextResponse.json({
      success: true,
      disposal,
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
