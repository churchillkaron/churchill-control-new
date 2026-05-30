import { supabase } from "@/lib/supabase";

export async function runNeuralEnterpriseLearning({
  tenantId,
}) {
  const memories = [];

  const { data: forecasts } =
    await supabase
      .from("financial_forecasts")
      .select("*")
      .eq("tenant_id", tenantId);

  for (const row of forecasts || []) {
    memories.push({
      tenant_id: tenantId,
      memory_type:
        "FORECAST_PATTERN",
      source_reference:
        row.id,
      learned_pattern: {
        projectedRevenue:
          row.projected_revenue,
        projectedProfit:
          row.projected_profit,
        confidence:
          row.confidence_score,
      },
      confidence_score:
        row.confidence_score || 0,
    });
  }

  const { data, error } =
    await supabase
      .from(
        "neural_enterprise_memory"
      )
      .insert(memories)
      .select();

  if (error) {
    throw error;
  }

  return data;
}
