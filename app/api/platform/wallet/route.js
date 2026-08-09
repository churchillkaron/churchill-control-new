import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { WalletRuntime } from "@/lib/platform/service-runtime/wallet/runtime/WalletRuntime";

export const dynamic = "force-dynamic";

function cleanValue(value) {
  const normalized = String(value ?? "").trim();

  if (
    !normalized ||
    normalized === "undefined" ||
    normalized === "null"
  ) {
    return null;
  }

  return normalized;
}

function errorResponse(error, status = 500) {
  return NextResponse.json(
    {
      success: false,
      error,
    },
    { status },
  );
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = cleanValue(
      searchParams.get("organization_id") ||
      searchParams.get("organizationId"),
    );
    const currency = cleanValue(searchParams.get("currency"));

    if (!organizationId) {
      return errorResponse("organization_id required", 400);
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status);
    }

    const wallet = await WalletRuntime.getOrCreate({
      organization_id: access.organizationId,
      currency: currency || undefined,
    });

    return NextResponse.json({
      success: true,
      wallet,
    });
  } catch (error) {
    console.error("PLATFORM_WALLET_ERROR", error);
    return errorResponse(error?.message || "Wallet lookup failed");
  }
}
