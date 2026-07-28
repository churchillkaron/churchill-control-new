import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function finite(value, field) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    throw new Error(`${field} must be numeric`);
  }
  return normalized;
}

export async function runIntercompanyReconciliation({
  organizationId,
  entityId,
  transactionId,
  sourceBalance,
  targetBalance,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");
  if (!transactionId) throw new Error("transactionId required");

  const source = finite(sourceBalance, "sourceBalance");
  const target = finite(targetBalance, "targetBalance");

  const { data: transaction, error: transactionError } = await supabaseAdmin
    .from("intercompany_transactions")
    .select("id, organization_id, from_legal_entity_id, to_legal_entity_id, status")
    .eq("organization_id", organizationId)
    .eq("id", transactionId)
    .maybeSingle();

  if (transactionError) throw transactionError;
  if (!transaction) {
    throw new Error("Intercompany transaction not found in organization scope");
  }

  if (
    String(transaction.from_legal_entity_id) !== String(entityId) &&
    String(transaction.to_legal_entity_id) !== String(entityId)
  ) {
    throw new Error("Reconciliation entity is not part of the transaction");
  }

  if (String(transaction.status || "").toLowerCase() === "settled") {
    throw new Error("Settled intercompany transactions cannot be reconciled again");
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("intercompany_reconciliations")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("transaction_id", transactionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    const sameValues =
      Number(existing.source_balance) === source &&
      Number(existing.target_balance) === target;

    if (sameValues) {
      return {
        ...existing,
        unchanged: true,
      };
    }

    throw new Error(
      "A reconciliation already exists for this transaction and entity with different balances"
    );
  }

  const variance = source - target;
  const status = Math.abs(variance) < 0.01 ? "matched" : "variance";

  const { data, error } = await supabaseAdmin
    .from("intercompany_reconciliations")
    .insert({
      organization_id: organizationId,
      entity_id: entityId,
      transaction_id: transactionId,
      source_balance: source,
      target_balance: target,
      variance_amount: variance,
      reconciliation_status: status,
    })
    .select()
    .single();

  if (error) throw error;

  const { error: updateError } = await supabaseAdmin
    .from("intercompany_transactions")
    .update({
      reconciliation_status: status,
      status: status === "matched" ? "reconciled" : transaction.status,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", transactionId);

  if (updateError) throw updateError;

  return data;
}
