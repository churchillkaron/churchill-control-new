import { NextResponse } from "next/server";

import { WalletRuntime }
from "@/lib/platform/service-runtime/wallet/runtime/WalletRuntime";

export const dynamic = "force-dynamic";

export async function GET(request) {

  try {

    const { searchParams } =
      new URL(request.url);

    const organizationId =
      searchParams.get("organization_id");

    if (!organizationId) {

      return NextResponse.json(
        {
          success: false,
          error:
            "organization_id required",
        },
        { status: 400 }
      );

    }

    const wallet =
      await WalletRuntime.getOrCreate(
        organizationId
      );

    return NextResponse.json({
      success: true,
      wallet,
    });

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );

  }

}
