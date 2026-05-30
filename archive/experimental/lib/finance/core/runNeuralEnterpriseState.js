import { supabase } from "@/lib/supabase";

export async function runNeuralEnterpriseState({
  tenantId,
}) {
  const { data: ai } =
    await supabase
      .from("ai_operating_cycles")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", {
        ascending: false,
      })
      .limit(1);

  const latest = ai?.[0];

  if (!latest) {
    throw new Error(
      "AI operating cycle missing"
    );
  }

  const intelligence =
    latest.strategic_score || 0;

  const autonomy =
    latest.operational_score || 0;

  const optimization =
    latest.optimization_score || 0;

  const strategic =
    latest.financial_score || 0;

  let state = "learning";

  if (
    intelligence > 80 &&
    autonomy > 80
  ) {
    state = "adaptive";
  }

  if (
    intelligence > 90 &&
    optimization > 90
  ) {
    state = "autonomous";
  }

  const { data, error } =
    await supabase
      .from(
        "neural_enterprise_state"
      )
      .insert({
        tenant_id: tenantId,
        enterprise_state:
          state,
        intelligence_level:
          intelligence,
        autonomy_level:
          autonomy,
        optimization_level:
          optimization,
        strategic_level:
          strategic,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
