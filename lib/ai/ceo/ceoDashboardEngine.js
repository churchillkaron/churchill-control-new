/**
 * CEO DASHBOARD ENGINE
 * Turns business data into executive decisions
 */

export function buildCEOView({ metrics = {}, brain = {} }) {

  const revenue = metrics?.revenue?.value || 0;
  const orders = metrics?.orders?.value || 0;
  const cost = metrics?.cost?.value || 0;

  const profit = revenue - cost;

  const healthScore =
    revenue > 0
      ? Math.min(100, Math.max(0, (profit / revenue) * 100))
      : 0;

  const alerts = [];

  if (healthScore < 20) {
    alerts.push({
      severity: "critical",
      message: "Business profitability is critically low"
    });
  }

  if (orders < 10) {
    alerts.push({
      severity: "warning",
      message: "Low order volume detected"
    });
  }

  if (cost > revenue * 0.6) {
    alerts.push({
      severity: "high",
      message: "Costs are too high relative to revenue"
    });
  }

  const actions = [];

  if (brain?.industry === "restaurant") {
    actions.push("Optimize menu pricing and reduce ingredient waste");
    actions.push("Increase table turnover during peak hours");
  }

  if (brain?.industry === "hotel") {
    actions.push("Improve occupancy rate via promotions");
    actions.push("Upsell premium room packages");
  }

  if (brain?.industry === "agency") {
    actions.push("Improve client retention workflows");
    actions.push("Automate project delivery pipeline");
  }

  return {
    healthScore: Number(healthScore.toFixed(2)),
    profit,
    revenue,
    cost,
    alerts,
    recommendedActions: actions
  };
}
