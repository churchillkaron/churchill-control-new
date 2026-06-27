/**
 * FINANCE INSIGHT ENGINE (LEVEL 6)
 * ONLY produces suggestions — NO EXECUTION
 */

export function generateFinanceInsights({ anomalies = [], cashflow = {} }) {
  const insights = [];

  if (anomalies.length > 0) {
    insights.push({
      type: "WARNING",
      message: "Anomalies detected in journal entries",
      action: "REVIEW_REQUIRED"
    });
  }

  if (cashflow?.trend === "NEGATIVE") {
    insights.push({
      type: "RISK",
      message: "Cashflow trending negative",
      action: "MANAGEMENT_REVIEW"
    });
  }

  return insights;
}
