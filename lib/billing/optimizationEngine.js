/**
 * AI BUSINESS OPTIMIZATION ENGINE
 * Finds unprofitable tenants, pricing risks and margin opportunities.
 */

export function optimizeSaaSBusiness({ tenants = [] }) {
  const recommendations = [];

  for (const tenant of tenants) {
    const margin = Number(tenant.margin || 0);
    const aiCost = Number(tenant.aiCost || 0);
    const revenue = Number(tenant.revenue || 0);

    if (margin < 30) {
      recommendations.push({
        tenantId: tenant.tenantId,
        name: tenant.name,
        severity: "high",
        type: "LOW_MARGIN_CLIENT",
        message: `${tenant.name} has low margin at ${margin}%. Review plan pricing or AI usage limits.`,
      });
    }

    if (aiCost > revenue * 0.4) {
      recommendations.push({
        tenantId: tenant.tenantId,
        name: tenant.name,
        severity: "critical",
        type: "AI_COST_RISK",
        message: `${tenant.name} AI cost is too high compared to revenue.`,
      });
    }
  }

  return {
    recommendations,
    count: recommendations.length,
    status: recommendations.length ? "attention_required" : "healthy",
  };
}
