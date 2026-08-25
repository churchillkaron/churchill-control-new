import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { searchManagedSecretaryNumbers } from "@/lib/operator/secretary/SecretaryManagedTelephonyRuntime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clean(value, limit = 500) {
  return String(value ?? "").trim().slice(0, limit) || null;
}

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = clean(searchParams.get("organization_id") || searchParams.get("organizationId"), 120);
    const countryCode = clean(searchParams.get("country_code") || searchParams.get("countryCode"), 10);
    const locality = clean(searchParams.get("locality"), 160);
    const numberType = clean(searchParams.get("number_type") || searchParams.get("numberType"), 80) || "local";
    const limit = Number(searchParams.get("limit") || 12);

    if (!organizationId) return errorResponse("organization_id required", 400);
    if (!countryCode) return errorResponse("country_code required", 400);

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return errorResponse(access.error, access.status);

    const result = await searchManagedSecretaryNumbers({
      countryCode,
      locality,
      numberType,
      limit,
    });

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      ...result,
    });
  } catch (error) {
    console.error("SECRETARY_TELEPHONY_NUMBER_SEARCH_FAILED", error?.message || error);
    const message = error?.message || "Secretary phone-number search failed";
    const status = message.includes("CONFIG_MISSING") ? 503 : 500;
    return errorResponse(message, status);
  }
}
