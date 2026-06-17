import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runIntercompanyElimination({
  tenantId,
  reconciliationId,
  eliminationAmount,
}) {
  const { data, error } =
    await supabase
      .from(
        "intercompany_eliminations"
      )
      .insert({
        tenant_id: tenantId,
        reconciliation_id:
          reconciliationId,
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
