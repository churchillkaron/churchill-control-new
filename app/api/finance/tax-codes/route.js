export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { TaxCodeRepository } from "@/lib/finance/tax-codes/repositories/taxCodeRepository";

function accessError(access) {
  return NextResponse.json(
    { success: false, error: access.error, taxCodes: [], rows: [] },
    { status: access.status }
  );
}

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
      return accessError(access);
    }

    const records = await TaxCodeRepository.list({
      organizationId: access.organizationId,
    });

    const taxCodes = records.map(record => ({
      id: record.id,
      code: record.tax_code,
      name: record.tax_name,
      rate: Number(record.tax_rate || 0),
      regime: record.tax_regime,
      standard: record.accounting_standard,
      effective_from: record.effective_from,
      effective_to: record.effective_to,
      is_active: record.is_active,
    }));

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      taxCodes,
      rows: taxCodes,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Tax codes load failed",
        taxCodes: [],
        rows: [],
      },
      { status: 500 }
    );
  }
}
