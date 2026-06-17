import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runEnterpriseCommandCenter({
  tenantId,
}) {
  const { data: risks } =
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

  const { data: close } =
    await supabase
      .from(
        "accounting_autonomous_close_cycles"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", {
        ascending: false,
      })
      .limit(1);

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

  const risk =
    risks?.[0] || {};

  const closeCycle =
    close?.[0] || {};

  const forecast =
    forecasts?.[0] || {};

  const operationalHealth =
    Math.max(
      0,
      100 -
        Number(
          risk.operational_risk ||
            0
        )
    );

  const accountingHealth =
    Math.max(
      0,
      100 -
        Number(
          risk.accounting_risk ||
            0
        )
    );

  const treasuryHealth =
    Math.max(
      0,
      100 -
        Number(
          risk.liquidity_risk ||
            0
        )
    );

  const complianceHealth =
    closeCycle.readiness_score ||
    0;

  const profitabilityHealth =
    forecast.projected_profit >
    0
      ? 85
      : 40;

  const aiConfidence =
    forecast.confidence_score ||
    50;

  const overallHealth =
    (
      operationalHealth +
      accountingHealth +
      treasuryHealth +
      complianceHealth +
      profitabilityHealth +
      aiConfidence
    ) / 6;

  let status = "stable";

  if (overallHealth < 50) {
    status = "critical";
  } else if (
    overallHealth < 75
  ) {
    status = "warning";
  }

  const { data, error } =
    await supabase
      .from(
        "enterprise_command_center_snapshots"
      )
      .insert({
        tenant_id: tenantId,
        operational_health:
          operationalHealth,
        accounting_health:
          accountingHealth,
        treasury_health:
          treasuryHealth,
        compliance_health:
          complianceHealth,
        profitability_health:
          profitabilityHealth,
        ai_confidence:
          aiConfidence,
        overall_health:
          overallHealth,
        system_status: status,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
