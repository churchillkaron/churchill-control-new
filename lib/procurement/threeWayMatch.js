import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

// =====================================
// THREE WAY MATCH ENGINE
// =====================================

export async function threeWayMatch({

  vendorInvoiceId,

}) {

  // -----------------------------------
  // LOAD INVOICE
  // -----------------------------------

  const {
    data: invoice,
    error: invoiceError,
  } = await supabaseAdmin

    .from("vendor_invoices")

    .select("*")

    .eq("id", vendorInvoiceId)

    .single();

  if (invoiceError) {

    throw invoiceError;

  }

  // -----------------------------------
  // LOAD PO
  // -----------------------------------

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

  // -----------------------------------
  // LOAD GOODS RECEIPTS
  // -----------------------------------

  const {
  data: receipts,
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
  );

  if (receiptError) {

    throw receiptError;

  }

  // -----------------------------------
  // CALCULATE RECEIVED TOTAL
  // -----------------------------------

  const receivedTotal =
  (receipts || []).reduce(

    (receiptSum, receipt) => {

      const itemTotal =
        (receipt.goods_receipt_items || [])

          .reduce(

            (itemSum, item) =>

              itemSum +

              Number(
                item.total_price || 0
              ),

            0

          );

      return (
        receiptSum + itemTotal
      );

    },

    0

  );

  // -----------------------------------
  // CALCULATE VARIANCES
  // -----------------------------------

  const poTotal =
    Number(
      po.total_amount || 0
    );

  const invoiceTotal =
    Number(
      invoice.total_amount || 0
    );

  const poVariance =
    Math.abs(
      poTotal - invoiceTotal
    );

  const receiptVariance =
    Math.abs(
      receivedTotal -
      invoiceTotal
    );

  // -----------------------------------
  // MATCH RULES
  // -----------------------------------

  let matchStatus =
    "matched";

  let matchNotes =
    [];

  if (poVariance > 1) {

    matchStatus =
      "exception";

    matchNotes.push(
      "PO variance detected"
    );

  }

  if (receiptVariance > 1) {

    matchStatus =
      "exception";

    matchNotes.push(
      "Receipt variance detected"
    );

  }

  if (
    receivedTotal <= 0
  ) {

    matchStatus =
      "exception";

    matchNotes.push(
      "No goods receipt found"
    );

  }

  // -----------------------------------
  // UPDATE INVOICE
  // -----------------------------------

  await supabaseAdmin

    .from("vendor_invoices")

    .update({

      match_status:
        matchStatus,

      updated_at:
        new Date().toISOString(),

    })

    .eq(
      "id",
      invoice.id
    );

  // -----------------------------------
  // RESULT
  // -----------------------------------

  return {

    success: true,

    match_status:
      matchStatus,

    po_total:
      poTotal,

    received_total:
      receivedTotal,

    invoice_total:
      invoiceTotal,

    po_variance:
      poVariance,

    receipt_variance:
      receiptVariance,

    notes:
      matchNotes,

  };

}