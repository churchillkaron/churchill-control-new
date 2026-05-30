import { supabase } from "@/lib/supabase";

export async function runAIExecutiveDecisions({
  tenantId,
}) {
  const decisions = [];

  const { data: forecast } =
    await supabase
      .from(
        "financial_forecasts"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", {
        ascending: false,
      })
      .limit(1);

  const latest =
    forecast?.[0];

  if (
    latest?.projected_profit >
    latest?.projected_revenue *
      0.20
  ) {
    decisions.push({
      tenant_id: tenantId,
      decision_category:
        "EXPANSION",
      decision_title:
        "Expand High Margin Operations",
      ai_reasoning:
        "Projected profitability supports scaling",
      projected_impact:
        latest.projected_profit,
      execution_priority:
        "high",
    });
  } else {
    decisions.push({
      tenant_id: tenantId,
      decision_category:
        "EFFICIENCY",
      decision_title:
        "Reduce Operational Costs",
      ai_reasoning:
        "Profit margins below strategic target",
      projected_impact:
        latest.projected_profit,
      execution_priority:
        "high",
    });
  }

  const { data, error } =
    await supabase
      .from(
        "ai_executive_decisions"
      )
      .insert(decisions)
      .select();

  if (error) {
    throw error;
  }

  return data;
}
