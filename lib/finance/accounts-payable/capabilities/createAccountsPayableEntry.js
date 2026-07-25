import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function required(value, field) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`${field} required`);
  }

  return normalized;
}

export default async function createAccountsPayableEntry({
  organization_id,
  entity_id,
  vendor_invoice_id,
}) {
  try {
    const organizationId = required(
      organization_id,
      "organization_id"
    );
    const entityId = required(entity_id, "entity_id");
    const vendorInvoiceId = required(
      vendor_invoice_id,
      "vendor_invoice_id"
    );

    const {
      data: invoice,
      error: invoiceError,
    } = await supabaseAdmin
      .from("vendor_invoices")
      .select("id, organization_id, entity_id, status, approval_status")
      .eq("id", vendorInvoiceId)
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .maybeSingle();

    if (invoiceError) {
      throw invoiceError;
    }

    if (!invoice) {
      throw new Error(
        "Vendor invoice not found in organization and entity scope"
      );
    }

    const {
      data: accountsPayable,
      error: payableError,
    } = await supabaseAdmin
      .from("accounts_payable")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("vendor_invoice_id", vendorInvoiceId)
      .maybeSingle();

    if (payableError) {
      throw payableError;
    }

    if (!accountsPayable) {
      throw new Error(
        "Accounts payable aggregate missing for vendor invoice; recreate the invoice through the atomic vendor bill workflow"
      );
    }

    return {
      success: true,
      already_exists: true,
      accounts_payable: accountsPayable,
      vendor_invoice: invoice,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
