import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function runIntercompanyReconciliation({
  organizationId,
  entityId,
  transactionId,
  sourceBalance,
  targetBalance,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!entityId) {
    throw new Error("entityId required");
  }

  if (!transactionId) {
    throw new Error("transactionId required");
  }

  const { data: transaction, error: transactionError } = await supabaseAdmin
    .from("intercompany_transactions")
    .select("id, organization_id, from_legal_entity_id, to_legal_entity_id")
    .eq("organization_id", organizationId)
    .eq("id", transactionId)
    .maybeSingle();

  if (transactionError) {
    throw transactionError;
  }

  if (!transaction) {
    throw new Error("Intercompany transaction not found in organization scope");
  }

  if (
    String(transaction.from_legal_entity_id) !== String(entityId) &&
    String(transaction.to_legal_entity_id) !== String(entityId)
  ) {
    throw new Error("Reconciliation entity is not part of the transaction");
  }

  const variance =
    Number(sourceBalance || 0) -
    Number(targetBalance || 0);
  const status =
    Math.abs(variance) < 0.01
      ? "matched"
      : "variance";

  const { data, error } = await supabaseAdmin
    .from("intercompany_reconciliations")
    .insert({
      organization_id: organizationId,
      entity_id: entityId,
      transaction_id: transactionId,
      source_balance: sourceBalance,
      target_balance: targetBalance,
      variance_amount: variance,
      reconciliation_status: status,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  const { error: updateError } = await supabaseAdmin
    .from("intercompany_transactions")
    .update({
      reconciliation_status: status,
    })
    .eq("organization_id", organizationId)
    .eq("id", transactionId);

  if (updateError) {
    throw updateError;
  }

  return data;
}
