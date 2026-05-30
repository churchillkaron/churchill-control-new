import { supabase } from "@/lib/supabase";

export async function runLiquidityRiskAnalysis({
  tenantId,
}) {
  const { data: forecasts } =
    await supabase
      .from(
        "treasury_cash_forecasts"
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
      "No treasury forecast found"
    );
  }

  const liquidityRatio =
    latest.projected_outflows > 0
      ? latest.projected_closing_cash /
        latest.projected_outflows
      : 0;

  let riskLevel = "low";

  if (liquidityRatio < 1) {
    riskLevel = "high";
  } else if (
    liquidityRatio < 1.5
  ) {
    riskLevel = "medium";
  }

  const projectedShortfall =
    latest.projected_closing_cash < 0
      ? Math.abs(
          latest.projected_closing_cash
        )
      : 0;

  const { data, error } =
    await supabase
      .from(
        "treasury_liquidity_risks"
      )
      .insert({
        tenant_id: tenantId,
        risk_level: riskLevel,
        liquidity_ratio:
          liquidityRatio,
        projected_shortfall:
          projectedShortfall,
        notes:
          "Automated treasury liquidity analysis",
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
