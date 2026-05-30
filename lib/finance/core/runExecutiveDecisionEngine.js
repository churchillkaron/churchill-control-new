import { supabase } from "@/lib/supabase";

export async function runExecutiveDecisionEngine({
  tenantId,
}) {
  const { data: forecasts } =
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
    forecasts?.[0];

  if (!latest) {
    throw new Error(
      "No forecast found"
    );
  }

  let recommendation =
    "Maintain operational efficiency";

  let priority = "medium";

  if (
    latest.projected_profit < 0
  ) {
    recommendation =
      "Reduce operational costs immediately";

    priority = "high";
  } else if (
    latest.projected_profit >
    latest.projected_revenue *
      0.25
  ) {
    recommendation =
      "Expand operations and reinvest profits";

    priority = "high";
  }

  const { data, error } =
    await supabase
      .from(
        "executive_decisions"
      )
      .insert({
        tenant_id: tenantId,
        decision_type:
          "FINANCIAL_STRATEGY",
        decision_priority:
          priority,
        recommendation,
        projected_financial_impact:
          latest.projected_profit,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
