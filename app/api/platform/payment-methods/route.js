import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { PaymentRuntime } from "@/lib/platform/payment-runtime/PaymentRuntime";

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
    const country = cleanValue(searchParams.get("country"));
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

    const methods = await PaymentRuntime.getAvailablePaymentMethods({
      organizationId: access.organizationId,
      country,
      currency,
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      methods,
    });
  } catch (error) {
    console.error("PLATFORM_PAYMENT_METHODS_GET_ERROR", error);
    return errorResponse(error?.message || "Payment method lookup failed");
  }
}
