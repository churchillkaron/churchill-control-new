export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";

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
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.tax.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const { data: reports, error } = await supabaseAdmin
      .from("finance_tax_reports")
      .select("*")
      .eq("organization_id", access.organizationId);

    if (error) throw error;

    const rows = reports || [];
    const pendingFiling = rows.filter(
      (row) => row.status === "PENDING" || row.status === "DRAFT"
    ).length;
    const reportsAwaitingReview = rows.filter(
      (row) => row.status === "REVIEW"
    ).length;
    const totalTaxPayable = rows.reduce(
      (sum, row) => sum + Number(row.tax_payable || 0),
      0
    );
    const totalOutputTax = rows.reduce(
      (sum, row) => sum + Number(row.output_tax || 0),
      0
    );
    const totalInputTax = rows.reduce(
      (sum, row) => sum + Number(row.input_tax || 0),
      0
    );

    return NextResponse.json({
      success: true,
      reports: rows.length,
      pendingFiling,
      reportsAwaitingReview,
      taxPayable: totalTaxPayable,
      outputTax: totalOutputTax,
      inputTax: totalInputTax,
    });
  } catch (error) {
    const message = error.message || "Tax runtime load failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
