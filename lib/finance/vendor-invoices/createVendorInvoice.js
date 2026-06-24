import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createVendorInvoice({
  organization_id,
  tenant_id,
  vendor_id,
  invoice_number,
  invoice_date,
  total_amount,
  purchase_order_id = null,
}) {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("vendor_invoices")
      .insert([
        {

          organization_id,

          tenant_id,

          vendor_id,

          purchase_order_id,

          invoice_number,

          invoice_date,

          total_amount,

          status:
            "PENDING_MATCH",

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

      invoice:
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
