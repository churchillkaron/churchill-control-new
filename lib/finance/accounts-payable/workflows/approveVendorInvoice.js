import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function required(value, field) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`${field} required`);
  }

  return normalized;
}

export default async function approveVendorInvoice({
  organization_id,
  entity_id,
  vendor_invoice_id,
  approved_by,
  decision_reason = null,
  idempotency_key,
}) {
  try {
    const organizationId = required(
      organization_id,
      "organization_id"
    );
    const entityId = required(
      entity_id,
      "entity_id"
    );
    const vendorInvoiceId = required(
      vendor_invoice_id,
      "vendor_invoice_id"
    );
    const approvedBy = required(
      approved_by,
      "authenticated approved_by"
    );
    const idempotencyKey = required(
      idempotency_key,
      "idempotency_key"
    );

    const { data, error } = await supabaseAdmin.rpc(
      "finance_approve_vendor_invoice_idempotent",
      {
        p_organization_id: organizationId,
        p_entity_id: entityId,
        p_vendor_invoice_id: vendorInvoiceId,
        p_approved_by: approvedBy,
        p_decision_reason:
          String(decision_reason || "").trim() || null,
        p_idempotency_key: idempotencyKey,
      }
    );

    if (error) {
      throw new Error(
        `Vendor invoice approval failed: ${error.message}`
      );
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
