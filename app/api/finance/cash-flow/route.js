export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(request) {

  const { searchParams } = new URL(request.url);

  const access = await requireOrganizationAccess({
    organizationId: searchParams.get("organizationId"),
  });

  if (!access.success) {
    return NextResponse.json(
      { success: false, error: access.error },
      { status: access.status }
    );
  }

  const organizationId = access.organizationId;

  const { data: ledger, error } = await supabaseAdmin
    .from("general_ledger")
    .select(`
      *,
      chart_of_accounts!fk_general_ledger_account (
        id,
        code,
        name,
        category
      )
    `)
    .eq("organization_id", organizationId)
    .limit(10000);

  if (error) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }

  let operatingInflows = 0;
  let operatingOutflows = 0;
  let investingInflows = 0;
  let investingOutflows = 0;
  let financingInflows = 0;
  let financingOutflows = 0;

  for (const line of ledger || []) {

    const account = Array.isArray(line.chart_of_accounts)
      ? line.chart_of_accounts[0]
      : line.chart_of_accounts;

    const category = String(account?.category || "").toLowerCase();
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);

    // -------------------------
    // OPERATING (DEFAULT)
    // -------------------------
    if (category.includes("revenue") || category.includes("expense") || category.includes("cogs")) {
      operatingInflows += credit;
      operatingOutflows += debit;
    }

    // -------------------------
    // INVESTING
    // -------------------------
    if (category.includes("asset")) {
      investingOutflows += debit;
      investingInflows += credit;
    }

    // -------------------------
    // FINANCING
    // -------------------------
    if (category.includes("liabil")) {
      financingInflows += credit;
      financingOutflows += debit;
    }
  }

  const netOperatingCashFlow = operatingInflows - operatingOutflows;
  const netInvestingCashFlow = investingInflows - investingOutflows;
  const netFinancingCashFlow = financingInflows - financingOutflows;

  const netCashFlow =
    netOperatingCashFlow +
    netInvestingCashFlow +
    netFinancingCashFlow;

  return NextResponse.json({
    success: true,
    organizationId,
    summary: {
      operatingInflows,
      operatingOutflows,
      investingInflows,
      investingOutflows,
      financingInflows,
      financingOutflows,
    },
    netOperatingCashFlow,
    netInvestingCashFlow,
    netFinancingCashFlow,
    netCashFlow
  });
}
