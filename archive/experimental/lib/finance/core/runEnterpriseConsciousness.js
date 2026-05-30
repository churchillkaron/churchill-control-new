import { supabase } from "@/lib/supabase";

export async function runEnterpriseConsciousness({
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

  const latest =
    ai?.[0];

  if (!latest) {
    throw new Error(
      "AI operating cycle missing"
    );
  }

  const awareness =
    latest.strategic_score || 0;

  const reasoning =
    latest.financial_score || 0;

  const alignment =
    latest.optimization_score ||
    0;

  const { data, error } =
    await supabase
      .from(
        "enterprise_consciousness"
      )
      .insert({
        tenant_id: tenantId,
        consciousness_type:
          "STRATEGIC_ENTERPRISE",
        awareness_level:
          awareness,
        reasoning_depth:
          reasoning,
        strategic_alignment:
          alignment,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
