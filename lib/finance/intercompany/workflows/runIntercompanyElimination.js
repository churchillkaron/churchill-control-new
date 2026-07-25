import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function runIntercompanyElimination({
  organizationId,
  entityId,
  reconciliationId,
  eliminationAmount,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!entityId) {
    throw new Error("entityId required");
  }

  if (!reconciliationId) {
    throw new Error("reconciliationId required");
  }

  const amount = Number(eliminationAmount || 0);

  if (amount <= 0) {
    throw new Error("eliminationAmount must be positive");
  }

  const { data: reconciliation, error: reconciliationError } =
    await supabaseAdmin
      .from("intercompany_reconciliations")
      .select("id, organization_id, entity_id, variance_amount")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("id", reconciliationId)
      .maybeSingle();

  if (reconciliationError) {
    throw reconciliationError;
  }

  if (!reconciliation) {
    throw new Error("Intercompany reconciliation not found in entity scope");
  }

  const openVariance = Math.abs(
    Number(reconciliation.variance_amount || 0)
  );

  if (openVariance > 0 && amount - openVariance > 0.01) {
    throw new Error("Elimination amount exceeds reconciliation variance");
  }

  const { data, error } = await supabaseAdmin
    .from("intercompany_eliminations")
    .insert({
      organization_id: organizationId,
      entity_id: entityId,
      reconciliation_id: reconciliationId,
      elimination_amount: amount,
      elimination_status: "posted",
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
