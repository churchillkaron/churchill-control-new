export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { TaxCodeRepository } from "@/lib/finance/tax-codes/repositories/taxCodeRepository";

function statusFor(message) {
  return String(message || "").toLowerCase().includes("permission denied") ? 403 : 500;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request: req,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, taxCodes: [], rows: [] },
        { status: access.status }
      );
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.tax.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const data = (await TaxCodeRepository.list({
      organizationId: access.organizationId,
    })).filter((row) => row.is_active !== false);

    const taxCodes = data.map((t) => ({
      id: t.id,
      code: t.tax_code,
      name: t.tax_name,
      rate: t.tax_rate,
      regime: t.tax_regime,
      standard: t.accounting_standard,
      effective_from: t.effective_from,
      effective_to: t.effective_to,
      is_active: t.is_active,
    }));

    return NextResponse.json({
      success: true,
      taxCodes,
      rows: taxCodes,
    });
  } catch (error) {
    const message = error.message || "Tax codes load failed";
    return NextResponse.json(
      { success: false, error: message, taxCodes: [], rows: [] },
      { status: statusFor(message) }
    );
  }
}
