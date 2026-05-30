import { supabase } from "@/lib/supabase";

export async function runSingularityCore({
  tenantId,
}) {
  const { data: neural } =
    await supabase
      .from(
        "neural_enterprise_state"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", {
        ascending: false,
      })
      .limit(1);

  const latest =
    neural?.[0];

  if (!latest) {
    throw new Error(
      "Neural enterprise state missing"
    );
  }

  const intelligence =
    Number(
      latest.intelligence_level ||
        0
    );

  const autonomy =
    Number(
      latest.autonomy_level ||
        0
    );

  const prediction =
    Number(
      latest.optimization_level ||
        0
    );

  const adaptation =
    Number(
      latest.strategic_level ||
        0
    );

  const singularity =
    (
      intelligence +
      autonomy +
      prediction +
      adaptation
    ) / 4;

  let state = "emerging";

  if (singularity > 85) {
    state = "adaptive";
  }

  if (singularity > 95) {
    state = "self-evolving";
  }

  const { data, error } =
    await supabase
      .from(
        "singularity_core_cycles"
      )
      .insert({
        tenant_id: tenantId,
        singularity_state:
          state,
        enterprise_intelligence:
          intelligence,
        enterprise_autonomy:
          autonomy,
        enterprise_prediction:
          prediction,
        enterprise_adaptation:
          adaptation,
        singularity_score:
          singularity,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
