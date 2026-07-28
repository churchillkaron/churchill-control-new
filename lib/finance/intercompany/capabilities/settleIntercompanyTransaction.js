import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function actorId(value) {
  const normalized = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

export default async function settleIntercompanyTransaction({
  organization_id,
  entity_id,
  transaction_id,
  settled_by = null,
}) {
  const organizationId = required(organization_id, "organization_id");
  const entityId = required(entity_id, "entity_id");
  const transactionId = required(transaction_id, "transaction_id");

  const { data: transaction, error: loadError } = await supabaseAdmin
    .from("intercompany_transactions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", transactionId)
    .maybeSingle();

  if (loadError) throw loadError;
  if (!transaction) throw new Error("TRANSACTION_NOT_FOUND");

  if (
    String(transaction.from_legal_entity_id) !== entityId &&
    String(transaction.to_legal_entity_id) !== entityId
  ) {
    throw new Error("Settlement entity is not part of the transaction");
  }

  const currentStatus = String(transaction.status || "pending").toLowerCase();
  if (currentStatus === "settled") {
    return {
      success: true,
      transaction,
      unchanged: true,
    };
  }

  if (!["pending", "reconciled", "approved"].includes(currentStatus)) {
    throw new Error(`Transaction status ${currentStatus} cannot be settled`);
  }

  const reconciliationStatus = String(
    transaction.reconciliation_status || "pending"
  ).toLowerCase();

  if (!['matched', 'reconciled'].includes(reconciliationStatus)) {
    throw new Error(
      "Intercompany transaction must have a matched reconciliation before settlement"
    );
  }

  const now = new Date().toISOString();
  const settledBy = actorId(settled_by);
  const { data, error } = await supabaseAdmin
    .from("intercompany_transactions")
    .update({
      status: "settled",
      settled_at: now,
      settled_by: settledBy,
      updated_at: now,
    })
    .eq("organization_id", organizationId)
    .eq("id", transactionId)
    .neq("status", "settled")
    .select()
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const { data: current, error: currentError } = await supabaseAdmin
      .from("intercompany_transactions")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", transactionId)
      .maybeSingle();

    if (currentError) throw currentError;
    if (String(current?.status || "").toLowerCase() === "settled") {
      return { success: true, transaction: current, unchanged: true };
    }
    throw new Error("Intercompany settlement was not applied");
  }

  const { error: auditError } = await supabaseAdmin
    .from("audit_logs")
    .insert({
      organization_id: organizationId,
      action: "INTERCOMPANY_SETTLED",
      entity_type: "intercompany_transaction",
      entity_id: transactionId,
      metadata: {
        legal_entity_id: entityId,
        reference_number: transaction.reference_number,
        settled_by: settledBy,
        previous_status: currentStatus,
      },
    });

  if (auditError) throw auditError;

  return {
    success: true,
    transaction: data,
  };
}
