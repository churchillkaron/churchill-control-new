import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runRiskScoring({
  tenantId,
}) {
  const { data: anomalies } =
    await supabase
      .from(
        "accounting_anomalies"
      )
      .select("*")
      .eq("tenant_id", tenantId);

  const { data: liquidity } =
    await supabase
      .from(
        "treasury_liquidity_risks"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", {
        ascending: false,
      })
      .limit(1);

  let operationalRisk = 0;
  let fraudRisk = 0;

  for (const anomaly of anomalies || []) {
    operationalRisk += 10;

    if (
      anomaly.severity === "high"
    ) {
      fraudRisk += 15;
    }
  }

  const liquidityRisk =
    liquidity?.[0]?.risk_level ===
    "high"
      ? 80
      : liquidity?.[0]
          ?.risk_level ===
        "medium"
      ? 50
      : 20;

  const accountingRisk =
    operationalRisk * 0.8;

  const overallRisk =
    (
      operationalRisk +
      fraudRisk +
      liquidityRisk +
      accountingRisk
    ) / 4;

  const { data, error } =
    await supabase
      .from(
        "accounting_risk_scores"
      )
      .insert({
        tenant_id: tenantId,
        operational_risk:
          operationalRisk,
        liquidity_risk:
          liquidityRisk,
        accounting_risk:
          accountingRisk,
        fraud_risk:
          fraudRisk,
        overall_risk:
          overallRisk,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
