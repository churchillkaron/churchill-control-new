import { NextResponse } from "next/server";

import { runAssetDepreciation } from "@/lib/finance/core/runAssetDepreciation";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const depreciation =
      await runAssetDepreciation({
        tenantId:
          body.tenantId,
        assetId:
          body.assetId,
        depreciationDate:
          body.depreciationDate,
      });

    return NextResponse.json({
      success: true,
      depreciation,
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
