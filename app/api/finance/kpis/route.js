import { NextResponse }
from "next/server";

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

    .limit(10000);

  let revenue = 0;

  let cogs = 0;

  let expenses = 0;

  let assets = 0;

  let liabilities = 0;

  let cash = 0;

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

    const accountCode =
      String(
        account?.code || ""
      );

    const debit =
      Number(line.debit || 0);

    const credit =
      Number(line.credit || 0);

    // ------------------------
    // REVENUE
    // ------------------------

    if (
      category.includes(
        "revenue"
      )
    ) {

      revenue +=
        credit - debit;

    }

    // ------------------------
    // COGS
    // ------------------------

    if (
      category.includes(
        "cogs"
      )
    ) {

      cogs +=
        debit - credit;

    }

    // ------------------------
    // EXPENSES
    // ------------------------

    if (
      category.includes(
        "expense"
      )
    ) {

      expenses +=
        debit - credit;

    }

    // ------------------------
    // ASSETS
    // ------------------------

    if (
      category.includes(
        "asset"
      )
    ) {

      assets +=
        debit - credit;

    }

    // ------------------------
    // LIABILITIES
    // ------------------------

    if (
      category.includes(
        "liabil"
      )
    ) {

      liabilities +=
        credit - debit;

    }

    // ------------------------
    // CASH
    // ------------------------

    if (
      accountCode === "1000"
    ) {

      cash +=
        debit - credit;

    }

  }

  const grossProfit =

    revenue - cogs;

  const netProfit =

    revenue -
    cogs -
    expenses;

  const grossMargin =

    revenue > 0

      ? (
          grossProfit /
          revenue
        ) * 100

      : 0;

  const netMargin =

    revenue > 0

      ? (
          netProfit /
          revenue
        ) * 100

      : 0;

  const foodCostPercent =

    revenue > 0

      ? (
          cogs /
          revenue
        ) * 100

      : 0;

  const currentRatio =

    liabilities > 0

      ? (
          assets /
          liabilities
        )

      : 0;

  return NextResponse.json({

    success: true,

    tenantId,

    metrics: {

      revenue,

      cogs,

      expenses,

      grossProfit,

      netProfit,

      assets,

      liabilities,

      cash,

    },

    kpis: {

      grossMargin,

      netMargin,

      foodCostPercent,

      currentRatio,

    },

  });

}
