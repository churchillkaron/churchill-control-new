import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function runThreeWayMatch({
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

    const {
      data: po,
      error: poError,
    } = await supabaseAdmin
      .from("purchase_orders")
      .select("*")
      .eq(
        "id",
        invoice.purchase_order_id
      )
      .single();

    if (poError) {
      throw poError;
    }

    const {
      data: receipt,
      error: receiptError,
    } = await supabaseAdmin
      .from("goods_receipts")
      .select("*")
      .eq(
        "purchase_order_id",
        po.id
      )
      .maybeSingle();

    if (receiptError) {
      throw receiptError;
    }

    const poAmount =
      Number(
        po.total_amount || 0
      );

    const invoiceAmount =
      Number(
        invoice.total_amount || 0
      );

    const matched =
      poAmount ===
      invoiceAmount;

    const {
      data: updatedInvoice,
      error: updateError,
    } = await supabaseAdmin
      .from("vendor_invoices")
      .update({

        status:
          matched
            ? "MATCHED"
            : "MISMATCH",

        matched_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        invoice.id
      )
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return {

      success: true,

      matched,

      purchase_order:
        po.id,

      goods_receipt:
        receipt?.id || null,

      invoice:
        updatedInvoice,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
