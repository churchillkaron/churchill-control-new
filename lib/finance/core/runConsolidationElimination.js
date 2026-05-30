import { supabase } from "@/lib/supabase";

export async function runConsolidationElimination({
  tenantId,
  eliminationType,
  sourceEntity,
  targetEntity,
  eliminationAmount,
}) {
  const { data, error } =
    await supabase
      .from(
        "consolidation_eliminations"
      )
      .insert({
        tenant_id: tenantId,
        elimination_type:
          eliminationType,
        source_entity:
          sourceEntity,
        target_entity:
          targetEntity,
        elimination_amount:
          eliminationAmount,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
