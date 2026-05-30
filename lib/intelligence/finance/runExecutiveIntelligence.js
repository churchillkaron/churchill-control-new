import { supabase } from "@/lib/supabase";

export async function runExecutiveIntelligence({
  tenantId,
}) {
  const { data: profitability } =
    await supabase
      .from(
        "profitability_snapshots"
      )
      .select("*")
      .eq("tenant_id", tenantId);

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

  let revenue = 0;
  let profit = 0;

  for (const row of profitability || []) {
    revenue += Number(
      row.revenue || 0
    );

    profit += Number(
      row.net_profit || 0
    );
  }

  const margin =
    revenue > 0
      ? (profit / revenue) * 100
      : 0;

  return {
    revenue,
    profit,
    margin,
    overallRisk:
      risks?.[0]
        ?.overall_risk || 0,
    executiveStatus:
      margin > 20
        ? "strong"
        : margin > 10
        ? "stable"
        : "critical",
  };
}
