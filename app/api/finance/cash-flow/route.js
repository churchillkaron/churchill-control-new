import { NextResponse }
from "next/server";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export async function GET() {

  const tenantId =
    "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

  const {
    data: ledger,
    error,
  } = await supabaseAdmin

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

    .eq(
      "tenant_id",
      tenantId
    )

    .order(
      "created_at",
      { ascending: false }
    )

    .limit(5000);

  if (error) {

    return NextResponse.json({

      success: false,

      error:
        error.message,

    }, {

      status: 500,

    });

  }

  const summary = {

    operatingInflows: 0,

    operatingOutflows: 0,

    investingInflows: 0,

    investingOutflows: 0,

    financingInflows: 0,

    financingOutflows: 0,

  };

  for (const line of ledger || []) {

    const account =
      Array.isArray(
        line.chart_of_accounts
      )
        ? line.chart_of_accounts[0]
        : line.chart_of_accounts;

    const accountCode =
      String(
        account?.code || ""
      );

    const debit =
      Number(line.debit || 0);

    const credit =
      Number(line.credit || 0);

    // CASH ACCOUNT ONLY

    if (
      accountCode !== "1000"
    ) {
      continue;
    }

    if (debit > 0) {

      summary.operatingInflows +=
        debit;

    }

    if (credit > 0) {

      summary.operatingOutflows +=
        credit;

    }

  }

  const netOperatingCashFlow =

    summary.operatingInflows -

    summary.operatingOutflows;

  const netInvestingCashFlow =

    summary.investingInflows -

    summary.investingOutflows;

  const netFinancingCashFlow =

    summary.financingInflows -

    summary.financingOutflows;

  const netCashFlow =

    netOperatingCashFlow +

    netInvestingCashFlow +

    netFinancingCashFlow;

  return NextResponse.json({

    success: true,

    tenantId,

    summary,

    netOperatingCashFlow,

    netInvestingCashFlow,

    netFinancingCashFlow,

    netCashFlow,

  });

}
