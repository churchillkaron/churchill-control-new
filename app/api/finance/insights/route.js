export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";

function statusFor(message) {
  return String(message || "").toLowerCase().includes("permission denied") ? 403 : 500;
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
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.accounting.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const organizationId = access.organizationId;
    const insights = [];

    const { data: ledger, error } = await supabaseAdmin
      .from("general_ledger")
      .select(`
        *,
        chart_of_accounts!fk_general_ledger_account (
          id,
          account_code,
          account_name,
          account_category,
          account_type
        )
      `)
      .eq("organization_id", organizationId)
      .limit(10000);

    if (error) throw error;

    let revenue = 0;
    let expenses = 0;
    let cogs = 0;
    let cash = 0;

    for (const line of ledger || []) {
      const account = Array.isArray(line.chart_of_accounts)
        ? line.chart_of_accounts[0]
        : line.chart_of_accounts;

      const category = String(account?.account_category || "").toLowerCase();
      const accountCode = String(account?.account_code || "");
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);

      if (category.includes("revenue")) revenue += credit - debit;
      if (category.includes("expense")) expenses += debit - credit;
      if (category.includes("cogs")) cogs += debit - credit;
      if (accountCode === "1000") cash += debit - credit;
    }

    const grossProfit = revenue - cogs;
    const netProfit = revenue - cogs - expenses;
    const foodCostPercent = revenue > 0 ? (cogs / revenue) * 100 : 0;
    const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    if (foodCostPercent > 35) {
      insights.push({
        severity: "critical",
        type: "HIGH_FOOD_COST",
        message: `Food cost critically high at ${foodCostPercent.toFixed(2)}%`,
      });
    } else if (foodCostPercent > 25) {
      insights.push({
        severity: "warning",
        type: "FOOD_COST_WARNING",
        message: `Food cost elevated at ${foodCostPercent.toFixed(2)}%`,
      });
    } else {
      insights.push({
        severity: "positive",
        type: "STRONG_MARGIN",
        message: `Food cost healthy at ${foodCostPercent.toFixed(2)}%`,
      });
    }

    if (netMargin < 10) {
      insights.push({
        severity: "warning",
        type: "LOW_NET_MARGIN",
        message: `Net margin low at ${netMargin.toFixed(2)}%`,
      });
    } else {
      insights.push({
        severity: "positive",
        type: "STRONG_PROFITABILITY",
        message: `Net margin healthy at ${netMargin.toFixed(2)}%`,
      });
    }

    if (cash < 0) {
      insights.push({
        severity: "critical",
        type: "NEGATIVE_CASH",
        message: "Cash position negative",
      });
    }

    return NextResponse.json({
      success: true,
      organizationId,
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
      insightCount: insights.length,
      insights,
    });
  } catch (error) {
    const message = error.message || "Finance insights load failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
