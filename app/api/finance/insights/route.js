import { NextResponse }
from "next/server";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export async function GET() {

  const tenantId =
    "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4";

  const insights = [];

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

  let expenses = 0;

  let cogs = 0;

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

    // -------------------------
    // REVENUE
    // -------------------------

    if (
      category.includes(
        "revenue"
      )
    ) {

      revenue +=
        credit - debit;

    }

    // -------------------------
    // EXPENSES
    // -------------------------

    if (
      category.includes(
        "expense"
      )
    ) {

      expenses +=
        debit - credit;

    }

    // -------------------------
    // COGS
    // -------------------------

    if (
      category.includes(
        "cogs"
      )
    ) {

      cogs +=
        debit - credit;

    }

    // -------------------------
    // CASH
    // -------------------------

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

  const foodCostPercent =

    revenue > 0

      ? (
          cogs /
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

  // -----------------------------------
  // AI INSIGHTS
  // -----------------------------------

  if (
    foodCostPercent > 35
  ) {

    insights.push({

      severity:
        "critical",

      type:
        "HIGH_FOOD_COST",

      message:
        `Food cost critically high at ${foodCostPercent.toFixed(2)}%`,

    });

  }

  else if (
    foodCostPercent > 25
  ) {

    insights.push({

      severity:
        "warning",

      type:
        "FOOD_COST_WARNING",

      message:
        `Food cost elevated at ${foodCostPercent.toFixed(2)}%`,

    });

  }

  else {

    insights.push({

      severity:
        "positive",

      type:
        "STRONG_MARGIN",

      message:
        `Food cost healthy at ${foodCostPercent.toFixed(2)}%`,

    });

  }

  if (
    netMargin < 10
  ) {

    insights.push({

      severity:
        "warning",

      type:
        "LOW_NET_MARGIN",

      message:
        `Net margin low at ${netMargin.toFixed(2)}%`,

    });

  }

  else {

    insights.push({

      severity:
        "positive",

      type:
        "STRONG_PROFITABILITY",

      message:
        `Net margin healthy at ${netMargin.toFixed(2)}%`,

    });

  }

  if (
    cash < 0
  ) {

    insights.push({

      severity:
        "critical",

      type:
        "NEGATIVE_CASH",

      message:
        "Cash position negative",

    });

  }

  return NextResponse.json({

    success: true,

    tenantId,

    metrics: {

      revenue,

      expenses,

      cogs,

      grossProfit,

      netProfit,

      cash,

      foodCostPercent,

      netMargin,

    },

    insightCount:
      insights.length,

    insights,

  });

}
