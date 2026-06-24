import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createAccountsPayableEntry({
  vendor_invoice_id,
}) {

  try {

    const {
      data: invoice,
      error: invoiceError,
    } = await supabaseAdmin
      .from("vendor_invoices")
      .select("*")
      .eq(
        "id",
        vendor_invoice_id
      )
      .single();

    if (invoiceError) {
      throw invoiceError;
    }

    if (
      invoice.status !==
      "MATCHED"
    ) {

      throw new Error(
        "INVOICE_NOT_MATCHED"
      );
    }

    const {
      data: existingAP,
    } = await supabaseAdmin
      .from("accounts_payable")
      .select("*")
      .eq(
        "vendor_invoice_id",
        invoice.id
      )
      .maybeSingle();

    if (existingAP) {

      return {

        success: true,

        already_exists: true,

        accounts_payable:
          existingAP,

      };

    }

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("accounts_payable")
      .insert([
        {

          organization_id:
            invoice.organization_id,

          tenant_id:
            invoice.tenant_id,

          vendor_id:
            invoice.vendor_id,

          vendor_invoice_id:
            invoice.id,

          amount:
            invoice.total_amount,

          status:
            "PENDING_PAYMENT",

          created_at:
            new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {

      success: true,

      accounts_payable:
        data,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
