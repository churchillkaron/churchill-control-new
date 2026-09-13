export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
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

    await requireFinanceWorkspacePermission({
      capabilityId: "currencies",
      operation: "read",
      access,
    });

    const currencyId = searchParams.get("currency_id") || searchParams.get("currencyId") || searchParams.get("id");
    let currencies = await listFinanceCurrencies({
      organizationId: access.organizationId,
      includeInactive: true,
    });
    if (currencyId) currencies = currencies.filter((currency) => String(currency.id) === String(currencyId));

    return NextResponse.json({
      success: true,
      currencies,
      rows: currencies,
    });
  } catch (error) {
    const message = error?.message || "Currencies load failed";
    return NextResponse.json(
      {
        success: false,
        error: message,
        currencies: [],
        rows: [],
      },
      { status: /permission denied/i.test(message) ? 403 : 500 }
    );
  }
}
