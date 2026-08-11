import { getExecutiveKPIs } from "@/lib/finance/reporting/reports/getExecutiveKPIs";

export async function getExecutiveAlerts({ organizationId, entityId = null } = {}) {
  const metrics = await getExecutiveKPIs({ organizationId, entityId });
  const alerts = [];

  if (metrics.net_operating_result < 0) {
    alerts.push({
      severity: "critical",
      type: "NEGATIVE_OPERATING_RESULT",
      message: "Net operating result is negative.",
      value: metrics.net_operating_result,
    });
  }

  if (metrics.gross_profit < 0) {
    alerts.push({
      severity: "critical",
      type: "NEGATIVE_GROSS_PROFIT",
      message: "Gross profit is negative.",
      value: metrics.gross_profit,
    });
  }

  if (metrics.cash < 0) {
    alerts.push({
      severity: "warning",
      type: "NEGATIVE_CASH_POSITION",
      message: "Ledger cash position is negative.",
      value: metrics.cash,
    });
  }

  return alerts;
}
