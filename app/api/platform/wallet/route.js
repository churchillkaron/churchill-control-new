import { NextResponse } from "next/server";

import { WalletRuntime }
from "@/lib/platform/service-runtime/wallet/runtime/WalletRuntime";

export const dynamic = "force-dynamic";

function cleanValue(value) {
  const normalized =
    String(value ?? "").trim();

  if (
    !normalized ||
    normalized === "undefined" ||
    normalized === "null"
  ) {
    return null;
  }

  return normalized;
}

export async function GET(request) {

  try {

    const { searchParams } =
      new URL(request.url);

    const organizationId =
      cleanValue(
        searchParams.get("organization_id") ||
        searchParams.get("organizationId")
      );

    const currency =
      cleanValue(
        searchParams.get("currency")
      );

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
      await WalletRuntime.getOrCreate({
        organization_id:
          organizationId,
        currency:
          currency || undefined,
      });

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
