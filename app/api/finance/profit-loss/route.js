import { NextResponse } from "next/server";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(request) {

  const {
    searchParams,
  } = new URL(
    request.url
  );

  const access =
    await requireOrganizationAccess({

      organizationId:
        searchParams.get(
          "organizationId"
        ),

    });

  if (!access.success) {

    return NextResponse.json(
      {
        success: false,
        error:
          access.error,
      },
      {
        status:
          access.status,
      }
    );

  }

  const tenantId =
    access.tenantId;

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
    .limit(1000);

  console.log(
    "[P&L_LEDGER_SAMPLE]",
    JSON.stringify(
      ledger?.[0],
      null,
      2
    )
  );


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

    revenue: 0,

    cogs: 0,

    expenses: 0,

    otherIncome: 0,

    otherExpenses: 0,

  };

  for (const line of ledger || []) {

    const account =
      Array.isArray(
        line.chart_of_accounts
      )
        ? line.chart_of_accounts[0]
        : line.chart_of_accounts;

    const category =
      String(
        account?.category || ""
      ).toLowerCase();

    const debit =
      Number(line.debit || 0);

    const credit =
      Number(line.credit || 0);

    const amount =
      credit - debit;

    console.log(
      "[P&L_CATEGORY]",
      {
        account:
          account?.name,
        category,
        debit,
        credit,
      }
    );

    // -------------------------
    // REVENUE
    // -------------------------

    if (
      category.includes(
        "revenue"
      )
    ) {

      summary.revenue +=
        amount;

    }

    // -------------------------
    // COGS
    // -------------------------

    else if (
      category.includes(
        "cogs"
      )
    ) {

      summary.cogs +=
        debit - credit;

    }

    // -------------------------
    // EXPENSES
    // -------------------------

    else if (
      category.includes(
        "expense"
      )
    ) {

      summary.expenses +=
        debit - credit;

    }

    // -------------------------
    // OTHER INCOME
    // -------------------------

    else if (
      category.includes(
        "other income"
      )
    ) {

      summary.otherIncome +=
        amount;

    }

    // -------------------------
    // OTHER EXPENSES
    // -------------------------

    else if (
      category.includes(
        "other expense"
      )
    ) {

      summary.otherExpenses +=
        debit - credit;

    }

  }

  const grossProfit =
    summary.revenue -
    summary.cogs;

  const operatingProfit =
    grossProfit -
    summary.expenses;

  const netProfit =
    operatingProfit +
    summary.otherIncome -
    summary.otherExpenses;

  return NextResponse.json({

    success: true,

    tenantId,

    summary,

    grossProfit,

    operatingProfit,

    netProfit,

  });

}
