import { NextResponse } from "next/server";

import {
  WalletRepository,
}
from "@/lib/platform/service-runtime/wallet/repositories/WalletRepository";

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

    if (!organizationId) {
      return NextResponse.json(
        {
          success: false,
          error: "organization_id required",
        },
        { status: 400 }
      );
    }

    const data =
      await WalletRepository.transactions(
        organizationId
      );

    return NextResponse.json({
      success: true,
      transactions: data,
    });

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );

  }

}
