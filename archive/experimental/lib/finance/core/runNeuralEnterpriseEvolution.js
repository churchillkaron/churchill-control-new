import { supabase } from "@/lib/supabase";

export async function runNeuralEnterpriseEvolution({
  tenantId,
}) {
  const { data: cycles } =
    await supabase
      .from("ai_operating_cycles")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", {
        ascending: true,
      });

  if (
    !cycles ||
    cycles.length < 2
  ) {
    return null;
  }

  const first = cycles[0];
  const latest =
    cycles[cycles.length - 1];

  const improvement =
    Number(
      latest.overall_score || 0
    ) -
    Number(
      first.overall_score || 0
    );

  const { data, error } =
    await supabase
      .from(
        "neural_enterprise_evolution"
      )
      .insert({
        tenant_id: tenantId,
        evolution_type:
          "AI_ENTERPRISE_GROWTH",
        previous_score:
          first.overall_score,
        new_score:
          latest.overall_score,
        improvement,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
