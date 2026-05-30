import { supabase } from "@/lib/supabase";

export async function runAIOptimizationEngine({
  tenantId,
}) {
  const optimizations = [];

  const { data: profitability } =
    await supabase
      .from(
        "profitability_snapshots"
      )
      .select("*")
      .eq("tenant_id", tenantId);

  for (const row of profitability || []) {
    if (
      Number(
        row.net_margin || 0
      ) < 10
    ) {
      optimizations.push({
        tenant_id: tenantId,
        optimization_type:
          "MARGIN_IMPROVEMENT",
        target_area:
          row.reference_id,
        expected_improvement:
          12,
      });
    }
  }

  if (optimizations.length === 0) {
    return [];
  }

  const { data, error } =
    await supabase
      .from(
        "ai_optimization_actions"
      )
      .insert(optimizations)
      .select();

  if (error) {
    throw error;
  }

  return data;
}
