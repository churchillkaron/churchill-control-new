import { supabase } from "@/lib/supabase";

export async function runAIOperatingSystem({
  tenantId,
}) {
  const { data: health } =
    await supabase
      .from(
        "enterprise_command_center_snapshots"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", {
        ascending: false,
      })
      .limit(1);

  const latest =
    health?.[0];

  if (!latest) {
    throw new Error(
      "Enterprise health snapshot missing"
    );
  }

  const strategicScore =
    Number(
      latest.overall_health || 0
    );

  const financialScore =
    Number(
      latest.accounting_health ||
        0
    );

  const operationalScore =
    Number(
      latest.operational_health ||
        0
    );

  const optimizationScore =
    (
      financialScore +
      operationalScore
    ) / 2;

  const overallScore =
    (
      strategicScore +
      financialScore +
      operationalScore +
      optimizationScore
    ) / 4;

  const { data, error } =
    await supabase
      .from("ai_operating_cycles")
      .insert({
        tenant_id: tenantId,
        cycle_type:
          "ENTERPRISE_AUTONOMOUS",
        strategic_score:
          strategicScore,
        financial_score:
          financialScore,
        operational_score:
          operationalScore,
        optimization_score:
          optimizationScore,
        overall_score:
          overallScore,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
