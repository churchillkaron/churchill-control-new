import { getExecutiveKPIs } from "@/lib/finance/reporting/reports/getExecutiveKPIs";

function alert({ severity, type, message, evidence }) {
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

  if (Number(summary.ledger_line_count || 0) === 0) {
    alerts.push(alert({
      severity: "info",
      type: "NO_POST