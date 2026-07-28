export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getExecutiveKPIs } from "@/lib/finance/reporting/reports/getExecutiveKPIs";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId: searchParams.get("organizationId") || searchParams.get("organization_id"),
      request,
    });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, insights: [] },
        { status: access.status }
      );
    }

    const entityId = searchParams.get("entityId") || searchParams.get("entity_id");
    const periodId = searchParams.get("periodId") || searchParams.get("period_id") || null;
    const startDate = searchParams.get("startDate") || searchParams.get("start_date") || null;
    const endDate = searchParams.get("endDate") || searchParams.get("end_date") || null;

    const result = await getExecutiveKPIs({
      organizationId: access.organizationId,
      entityId,
      periodId,
      startDate,
      endDate,
    });
    const summary = result.summary || {};
    const insights = [];

    if (Number(summary.revenue || 0) === 0) {
      insights.push({
        severity: "info",
        type: "NO_REVENUE_ACTIVITY",
        title: "No posted revenue",
        message: "No posted revenue was found in the selected finance scope.",
      });
    }

    if (Number(summary.net_profit || 0) < 0) {
      insights.push({
        severity: "critical",
        type: "NEGATIVE_PROFITABILITY",
        title: "Negative profitability",
        message: "Posted costs and expenses exceed posted revenue in the selected scope.",
      });
    } else if (summary.net_profit_margin !== null && Number(summary.net_profit_margin) < 10) {
      insights.push({
        severity: "warning",
        type: "LOW_NET_MARGIN",
        title: "Low net margin",
        message: `Net profit margin is ${Number(summary.net_profit_margin).toFixed(2)}%.`,
      });
    } else if (summary.net_profit_margin !== null) {
      insights.push({
        severity: "positive",
        type: "POSITIVE_NET_MARGIN",
        title: "Positive net margin",
        message: `Net profit margin is ${Number(summary.net_profit_margin).toFixed(2)}%.`,
      });
    }

    if (Number(summary.cash || 0) < 0) {
      insights.push({
        severity: "critical",
        type: "NEGATIVE_CASH_POSITION",
        title: "Negative cash position",
        message: "The posted cash balance is negative in the selected scope.",
      });
    }

    if (Number(summary.liabilities || 0) > Number(summary.assets || 0)) {
      insights.push({
        severity: "warning",
        type: "LIABILITIES_EXCEED_ASSETS",
        title: "Liabilities exceed assets",
        message: "Posted liabilities are greater than posted assets in the selected scope.",
      });
    }

    return NextResponse.json({
      success: true,
      organization_id: result.organization_id,
      entity_id: result.entity_id,
      period_id: result.period_id,
      metrics: summary,
      insightCount: insights.length,
      insights,
      rows: insights,
      source: "POSTED_GENERAL_LEDGER",
    });
  } catch (error) {
    const message = error.message || "Finance insight load failed";
    return NextResponse.json(
      { success: false, error: message, insights: [] },
      { status: /required|not found|period/i.test(message) ? 400 : 500 }
    );
  }
}
