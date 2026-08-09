import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function required(value, field) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`${field} required`);
  }

  return normalized;
}

function uuid(value, field) {
  const normalized = required(value, field);

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error(`${field} must be a UUID`);
  }

  return normalized;
}

function targetStatus(value) {
  const normalized = String(value || "REVERSED").trim().toUpperCase();

  if (!["REVERSED", "REFUNDED"].includes(normalized)) {
    throw new Error("target_status must be REVERSED or REFUNDED");
  }

  return normalized;
}

export default async function reverseCustomerPayment({
  organization_id,
  entity_id,
  payment_id,
  target_status = "REVERSED",
  actor_id,
  reason = null,
  idempotency_key,
}) {
  const organizationId = uuid(organization_id, "organization_id");
  const entityId = uuid(entity_id, "entity_id");
  const paymentId = uuid(payment_id, "payment_id");
  const actorId = uuid(actor_id, "actor_id");
  const status = targetStatus(target_status);
  const idempotencyKey = required(idempotency_key, "idempotency_key");

  const { data: payment, error: paymentError } = await supabaseAdmin
    .from("customer_payments")
    .select(
      "id, organization_id, entity_id, party_id, journal_entry_id, reversal_journal_entry_id, status, amount, currency_code, exchange_rate"
    )
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("id", paymentId)
    .maybeSingle();

  if (paymentError) {
    throw new Error(`Customer payment lookup failed: ${paymentError.message}`);
  }

  if (!payment) {
    throw new Error("Customer payment not found");
  }

  if (["REVERSED", "REFUNDED"].includes(String(payment.status || "").toUpperCase())) {
    if (String(payment.status || "").toUpperCase() !== status) {
      throw new Error(`Customer payment is already ${payment.status}`);
    }

    return {
      success: true,
      payment_id: payment.id,
      party_id: payment.party_id,
      status: payment.status,
      reversal_journal_entry_id: payment.reversal_journal_entry_id,
      idempotent: true,
    };
  }

  if (!payment.journal_entry_id) {
    throw new Error("Customer payment has no posted journal to reverse");
  }

  const { data: originalLines, error: linesError } = await supabaseAdmin
    .from("journal_entry_lines")
    .select(
      "account_id, debit, credit, description, cost_center_id, department_id, party_id, project_id"
    )
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("journal_entry_id", payment.journal_entry_id)
    .order("line_number", { ascending: true });

  if (linesError) {
    throw new Error(`Original customer receipt journal lookup failed: ${linesError.message}`);
  }

  if (!Array.isArray(originalLines) || originalLines.length < 2) {
    throw new Error("Original customer receipt journal lines not found");
  }

  const reversalLines = originalLines.map((line) => ({
    account_id: line.account_id,
    debit: Number(line.credit || 0),
    credit: Number(line.debit || 0),
    description: `Reversal - ${line.description || "Customer receipt"}`,
    cost_center_id: line.cost_center_id || null,
    department_id: line.department_id || null,
    party_id: line.party_id || payment.party_id || null,
    project_id: line.project_id || null,
  }));

  const totalDebit = reversalLines.reduce(
    (sum, line) => sum + Number(line.debit || 0),
    0
  );
  const totalCredit = reversalLines.reduce(
    (sum, line) => sum + Number(line.credit || 0),
    0
  );

  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error("Original customer receipt journal is not balanced");
  }

  const { data, error } = await supabaseAdmin.rpc(
    "finance_reverse_customer_receipt_party_idempotent",
    {
      p_organization_id: organizationId,
      p_entity_id: entityId,
      p_payment_id: paymentId,
      p_target_status: status,
      p_actor_id: actorId,
      p_reason: reason ? String(reason).trim() : null,
      p_journal_lines: reversalLines,
      p_idempotency_key: idempotencyKey,
    }
  );

  if (error) {
    throw new Error(`Customer receipt reversal failed: ${error.message}`);
  }

  return data;
}
