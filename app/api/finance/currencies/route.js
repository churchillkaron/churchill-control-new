export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { listFinanceCurrencies } from "@/lib/finance/currencies/FinanceCurrencyPolicy";

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
        { success: false, error: access.error, currencies: [], rows: [] },
        { status: access.status }
      );
    }

    const currencies = await listFinanceCurrencies({
      organizationId: access.organizationId,
      includeInactive: true,
    });

    return NextResponse.json({
      success: true,
      currencies,
      rows: currencies,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Currencies load failed",
        currencies: [],
        rows: [],
      },
      { status: 500 }
    );
  }
}
