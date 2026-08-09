import { randomUUID } from "node:crypto";

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

export default async function issueCustomerCreditNote({
  organization_id,
  entity_id,
  party_id,
  source_invoice_id,
  credit_date,
  amount,
  reason = null,
  created_by,
  idempotency_key,
  prefix = "CN",
}) {
  const creditNoteId = randomUUID();
  const organizationId = uuid(organization_id, "organization_id");
  const entityId = uuid(entity_id, "entity_id");
  const partyId = uuid(party_id, "party_id");
  const sourceInvoiceId = uuid(source_invoice_id, "source_invoice_id");
  const createdBy = uuid(created_by, "created_by");
  const creditDate = required(credit_date, "credit_date");
  const idempotencyKey = required(idempotency_key, "idempotency_key");
  const creditAmount = positiveAmount(amount, "credit amount");

  const { data, error } = await supabaseAdmin.rpc(
    "finance_issue_customer_credit_note_idempotent",
    {
      p_credit_note_id: creditNoteId,
      p_organization_id: organizationId,
      p_entity_id: entityId,
      p_party_id: partyId,
      p_source_invoice_id: sourceInvoiceId,
      p_credit_date: creditDate,
      p_amount: creditAmount,
      p_reason: reason || null,
      p_created_by: createdBy,
      p_idempotency_key: idempotencyKey,
      p_prefix: String(prefix || "CN").trim() || "CN",
    }
  );

  if (error) {
    throw new Error(`Customer credit note failed: ${error.message}`);
  }

  return data;
}
