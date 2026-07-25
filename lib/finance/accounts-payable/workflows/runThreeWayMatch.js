import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function required(value, field) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`${field} required`);
  }

  return normalized;
}

export default async function runThreeWayMatch({
  organization_id,
  entity_id,
  vendor_invoice_id,
  matched_by,
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
    const matchedBy = required(
      matched_by,
      "authenticated matched_by"
    );

    const { data, error } = await supabaseAdmin.rpc(
      "finance_run_vendor_invoice_match_atomic",
      {
        p_organization_id: organizationId,
        p_entity_id: entityId,
        p_vendor_invoice_id: vendorInvoiceId,
        p_matched_by: matchedBy,
      }
    );

    if (error) {
      throw new Error(
        `Atomic three-way match failed: ${error.message}`
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
