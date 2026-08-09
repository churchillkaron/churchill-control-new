import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function uuid(value, field) {
  const normalized = required(value, field);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error(`${field} must be a UUID`);
  }
  return normalized;
}

function positiveAmount(value, field) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error(`${field} must be greater than zero`);
  }
  return normalized;
}

export default async function applyCustomerCredit({
  organization_id,
  entity_id,
  party_id,
  customer_credit_id,
  target_invoice_id,
  amount,
  applied_by,
  idempotency_key,
}) {
  const organizationId = uuid(organization_id, "organization_id");
  const entityId = uuid(entity_id, "entity_id");
  const partyId = uuid(party_id, "party_id");
  const customerCreditId = uuid(customer_credit_id, "customer_credit_id");
  const targetInvoiceId = uuid(target_invoice_id, "target_invoice_id");
  const appliedBy = uuid(applied_by, "applied_by");
  const applicationAmount = positiveAmount(amount, "amount");
  const idempotencyKey = required(idempotency_key, "idempotency_key");

  const { data, error } = await supabaseAdmin.rpc(
    "finance_apply_customer_credit_idempotent",
    {
      p_organization_id: organizationId,
      p_entity_id: entityId,
      p_party_id: partyId,
      p_customer_credit_id: customerCreditId,
      p_target_invoice_id: targetInvoiceId,
      p_amount: applicationAmount,
      p_applied_by: appliedBy,
      p_idempotency_key: idempotencyKey,
    }
  );

  if (error) {
    throw new Error(`Customer credit application failed: ${error.message}`);
  }

  return data;
}
