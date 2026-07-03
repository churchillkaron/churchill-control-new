import { NextResponse } from "next/server";

import {
  WalletRepository,
}
from "@/lib/platform/service-runtime/wallet/repositories/WalletRepository";

export const dynamic = "force-dynamic";

export async function GET(request) {

  try {

    const { searchParams } =
      new URL(request.url);

    const organizationId =
      searchParams.get("organization_id");

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
