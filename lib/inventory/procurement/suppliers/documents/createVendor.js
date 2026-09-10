import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const text = (value) => String(value ?? "").trim();

export async function createVendor(data = {}) {
  const organizationId = text(data.organization_id || data.organizationId);
  const legalName = text(data.legal_name || data.legalName);
  if (!organizationId) throw new Error("organization_id required");
  if (!legalName) throw new Error("legal_name required");

  const identity = [
    organizationId,
    text(data.vendor_code),
    text(data.tax_id),
    text(data.email).toLowerCase(),
    legalName,
  ].join("|");
  const idempotencyKey = text(data.idempotency_key || data.idempotencyKey) ||
    `supplier-create-v1:${createHash("sha256").update(identity).digest("hex")}`;

  const { data: result, error } = await supabaseAdmin.rpc("procurement_create_supplier_atomic", {
    p_organization_id: organizationId,
    p_vendor_code: text(data.vendor_code) || null,
    p_legal_name: legalName,
    p_display_name: text(data.display_name) || null,
    p_tax_id: text(data.tax_id) || null,
    p_email: text(data.email).toLowerCase() || null,
    p_phone: text(data.phone) || null,
    p_address: text(data.address) || null,
    p_payment_terms: text(data.payment_terms) || null,
    p_default_expense_account: text(data.default_expense_account) || null,
    p_default_ap_account: text(data.default_ap_account) || null,
    p_risk_level: text(data.risk_level || "LOW"),
    p_notes: text(data.notes) || null,
    p_actor_id: text(data.actor_id || data.created_by) || null,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  if (!result?.success) throw new Error(result?.error || "supplier creation failed");

  return {
    success: true,
    id: result.party_id,
    party_id: result.party_id,
    supplier_profile_id: result.supplier_profile_id,
    reused: result.reused === true,
    authorization_effect: "CONFIRMED_OR_DIRECT_GOVERNED_WRITE",
  };
}

export default createVendor;
