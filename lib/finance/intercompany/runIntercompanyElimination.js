import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runIntercompanyElimination({
  organizationId,
  reconciliationId,
  eliminationAmount,
}) {
  const { data, error } =
    await supabase
      .from(
        "intercompany_eliminations"
      )
      .insert({
        organization_id: organizationId,
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
