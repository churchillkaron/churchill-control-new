import { createServerSupabase } from "@/lib/shared/supabase/server";
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
      .select(`
        *,
        goods_receipt_items (*)
      `)
      .eq(
        "purchase_order_id",
        po.id
      )
      .maybeSingle();

    if (receiptError) {
      throw receiptError;
    }

    const {
      data: poItems,
      error: poItemsError,
    } = await supabaseAdmin
      .from("purchase_order_items")
      .select("*")
      .eq(
        "purchase_order_id",
        po.id
      );

    if (poItemsError) {
      throw poItemsError;
    }

    let grnAmount = 0;

    const priceMap = {};

    for (const item of poItems || []) {

      priceMap[item.id] =
        Number(
          item.unit_price || 0
        );

    }

    for (
      const item of
      receipt?.goods_receipt_items || []
    ) {

      grnAmount +=

        Number(
          item.accepted_qty || 0
        )

        *

        Number(
          priceMap[
            item.purchase_order_item_id
          ] || 0
        );

    }

    const poAmount =
      Number(
        po.total_amount || 0
      );

    const invoiceAmount =
      Number(
        invoice.total_amount || 0
      );

    const varianceAmount =
      invoiceAmount - grnAmount;

    const variancePercent =
      grnAmount > 0
        ? (
            varianceAmount /
            grnAmount
          ) * 100
        : 0;

    const matched =
      poAmount === grnAmount &&
      grnAmount === invoiceAmount;

    const {
      data: existingMatch,
      error: existingMatchError,
    } = await supabaseAdmin
      .from("invoice_matches")
      .select("*")
      .eq(
        "invoice_id",
        invoice.id
      )
      .maybeSingle();

    if (existingMatchError) {
      throw existingMatchError;
    }

    if (existingMatch) {

      return {

        success: true,

        already_exists: true,

        matched:
          existingMatch.match_status ===
          "MATCHED",

        match:
          existingMatch,
      };
    }

    await supabaseAdmin
      .from("invoice_matches")
      .insert({

        organization_id:
          invoice.organization_id,

        entity_id:
          invoice.entity_id,

        invoice_id:
          invoice.id,

        purchase_order_id:
          po.id,

        goods_receipt_id:
          receipt?.id || null,

        match_status:
          matched
            ? "MATCHED"
            : "MISMATCH",

        po_total:
          poAmount,

        grn_total:
          Number(
            grnAmount.toFixed(2)
          ),

        invoice_total:
          invoiceAmount,

        variance_amount:
          varianceAmount,

        variance_percent:
          variancePercent,

        matched_by:
          "SYSTEM",

        created_at:
          new Date().toISOString(),

        updated_at:
          new Date().toISOString(),

      });

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
