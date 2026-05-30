import { supabase } from "@/lib/supabase";

export async function runAccountingRecommendations({
  tenantId,
}) {
  const recommendations = [];

  const { data: risk } =
    await supabase
      .from(
        "accounting_risk_scores"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", {
        ascending: false,
      })
      .limit(1);

  const latestRisk =
    risk?.[0];

  if (
    latestRisk?.liquidity_risk > 60
  ) {
    recommendations.push({
      tenant_id: tenantId,
      recommendation_type:
        "cashflow",
      priority: "high",
      title:
        "Liquidity Risk Reduction",
      recommendation:
        "Reduce outgoing payments and accelerate collections",
      expected_impact:
        "Improved short-term liquidity",
    });
  }

  if (
    latestRisk?.fraud_risk > 40
  ) {
    recommendations.push({
      tenant_id: tenantId,
      recommendation_type:
        "controls",
      priority: "high",
      title:
        "Fraud Control Reinforcement",
      recommendation:
        "Increase approval requirements for financial transactions",
      expected_impact:
        "Reduced financial fraud exposure",
    });
  }

  const { data, error } =
    await supabase
      .from(
        "accounting_recommendations"
      )
      .insert(recommendations)
      .select();

  if (error) {
    throw error;
  }

  return data;
}
