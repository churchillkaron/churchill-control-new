import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

// =====================================
// UPDATE PO RECEIPT STATUS
// =====================================

export async function updatePurchaseOrderReceiptStatus({

  purchaseOrderId,

}) {

  // -----------------------------------
  // LOAD PO ITEMS
  // -----------------------------------

  const {
    data: poItems,
    error: poError,
  } = await supabaseAdmin

    .from("purchase_order_items")

    .select("*")

    .eq(
      "purchase_order_id",
      purchaseOrderId
    );

  if (poError) {

    throw poError;

  }

  // -----------------------------------
  // LOAD RECEIPTS
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
      purchaseOrderId
    );

  if (receiptError) {

    throw receiptError;

  }

  // -----------------------------------
  // CALCULATE RECEIVED QTY
  // -----------------------------------

  const receiptMap = {};

  for (const receipt of receipts || []) {

    for (
      const item of
      receipt.goods_receipt_items || []
    ) {

      const key =
        item.purchase_order_item_id;

      receiptMap[key] =
        (receiptMap[key] || 0) +

        Number(
          item.quantity_received || 0
        );

    }

  }

  // -----------------------------------
  // CHECK STATUS
  // -----------------------------------

  let fullyReceived =
    true;

  let partialReceived =
    false;

  for (const item of poItems || []) {

    const receivedQty =
      receiptMap[item.id] || 0;

    if (receivedQty > 0) {

      partialReceived =
        true;

    }

    if (
      receivedQty <
      Number(item.quantity || 0)
    ) {

      fullyReceived =
        false;

    }

  }

  // -----------------------------------
  // DETERMINE STATUS
  // -----------------------------------

  let nextStatus =
    "approved";

  if (fullyReceived) {

    nextStatus =
      "fully_received";

  } else if (
    partialReceived
  ) {

    nextStatus =
      "partial_receipt";

  }

  // -----------------------------------
  // UPDATE PO
  // -----------------------------------

  await supabaseAdmin

    .from("purchase_orders")

    .update({

      status:
        nextStatus,

      updated_at:
        new Date().toISOString(),

    })

    .eq(
      "id",
      purchaseOrderId
    );

  return {

    success: true,

    status:
      nextStatus,

  };

}