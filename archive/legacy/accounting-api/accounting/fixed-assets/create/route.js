import { NextResponse } from "next/server";

import { createFixedAsset } from "@/lib/finance/core/createFixedAsset";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const asset =
      await createFixedAsset({
        tenantId:
          body.tenantId,
        assetName:
          body.assetName,
        assetCategory:
          body.assetCategory,
        acquisitionDate:
          body.acquisitionDate,
        acquisitionCost:
          body.acquisitionCost,
        usefulLifeMonths:
          body.usefulLifeMonths,
        salvageValue:
          body.salvageValue,
      });

    return NextResponse.json({
      success: true,
      asset,
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
