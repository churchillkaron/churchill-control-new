import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { CurrencyRuntime } from "@/lib/platform/currency-runtime/CurrencyRuntime";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, currency: null },
        { status: access.status }
      );
    }

    const currency = await CurrencyRuntime.getEntityCurrency({
      organizationId: access.organizationId,
      entityId: searchParams.get("entityId") || searchParams.get("entity_id"),
    });

    return NextResponse.json({ success: true, currency });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Currency resolution failed" },
      { status: 500 }
    );
  }
}
