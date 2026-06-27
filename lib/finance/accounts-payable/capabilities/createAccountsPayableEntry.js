import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createAccountsPayableEntry({
  organization_id,
  entity_id,
  vendor_invoice_id,
}) {

  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!entity_id) {
    throw new Error("entity_id required");
  }
  try {
    const {
      data: invoice,
      error: invoiceError,
    } = await supabaseAdmin
      .from("vendor_invoices")
      .select("*")
      .eq("id", vendor_invoice_id)
      .single();

    if (invoiceError) {
      throw invoiceError;
    }

    if (invoice.status !== "MATCHED") {
      throw new Error("INVOICE_NOT_MATCHED");
    }

    if (!invoice.organization_id) {
      throw new Error("organization_id required");
    }

    if (!invoice.entity_id) {
      throw new Error("entity_id required");
    }

    const {
      data: existingAP,
    } = await supabaseAdmin
      .from("accounts_payable")
      .select("*")
      .eq("organization_id", invoice.organization_id)
      .eq("entity_id", invoice.entity_id)
      .eq("vendor_invoice_id", invoice.id)
      .maybeSingle();

    if (existingAP) {
      return {
        success: true,
        already_exists: true,
        accounts_payable: existingAP,
      };
    }

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("accounts_payable")
      .insert([
        {
          organization_id: invoice.organization_id,
          entity_id: invoice.entity_id,
          vendor_id: invoice.vendor_id,
          vendor_invoice_id: invoice.id,
          amount: invoice.total_amount,
          status: "PENDING_PAYMENT",
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {
      success: true,
      accounts_payable: data,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
