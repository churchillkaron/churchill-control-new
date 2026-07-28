import { getExecutiveKPIs } from "@/lib/finance/reporting/reports/getExecutiveKPIs";

function makeAlert(severity, type, message, evidence) {
  return {
    severity,
    type,
    message,
    source: "POSTED_GENERAL_LEDGER",
    evidence,
  };
}

export async function runExecutiveAlerts({
  organizationId,
  entityId,
  periodId = null,
  startDate = null,
  endDate = null,
} = {}) {
  const result = await getExecutiveKPIs({
    organizationId,
    entityId,
    periodId,
    startDate,
    endDate,
  });
  const summary = result.summary || {};
  const alerts = [];

  if (Number(summary.revenue || 0) === 0) {
    alerts.push(makeAlert(
      "info",
      "NO_REVENUE_ACTIVITY",
      "No posted revenue was found in the selected scope.",
      { revenue: Number(summary.revenue || 0) }
    ));
  }

  if (Number(summary.net_profit || 0) < 0) {
    alerts.push(makeAlert(
      "critical",
      "NEGATIVE_NET_PROFIT",
      "Posted costs and expenses exceed posted revenue in the selected scope.",
      {
        revenue: Number(summary.revenue || 0),
        cogs: Number(summary.cogs || 0),
        expenses: Number(summary.expenses || 0),
        net_profit: Number(summary.net_profit || 0),
      }
    ));
  }

  if (Number(summary.cash || 0) < 0) {
    alerts.push(makeAlert(
      "critical",
      "NEGATIVE_CASH_POSITION",
      "The posted cash balance is negative in the selected scope.",
      { cash: Number(summary.cash || 0) }
    ));
  }

  if (Number(summary.liabilities || 0) > Number(summary.assets || 0)) {
    alerts.push(makeAlert(
      "warning",
      "LIABILITIES_EXCEED_ASSETS",
      "Posted liabilities exceed posted assets in the selected scope.",
      {
        assets: Number(summary.assets || 0),
        liabilities: Number(summary.liabilities || 0),
      }
    ));
  }

  return {
    success: true,
    organization_id: result.organization_id,
    entity_id: result.entity_id,
    period_id: result.period_id,
    start_date: result.start_date,
    end_date: result.end_date,
    alerts,
    summary,
  };
}
