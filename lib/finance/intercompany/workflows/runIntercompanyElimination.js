import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function runIntercompanyElimination({
  organizationId,
  reconciliationId,
  eliminationAmount,
}) {
  const { data, error } =
    await supabaseAdmin
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
