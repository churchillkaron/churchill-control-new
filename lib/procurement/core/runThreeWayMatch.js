import { supabase } from "@/lib/supabase";

export async function runThreeWayMatch({
  tenantId,
  purchaseOrderId,
  goodsReceiptId,
  invoiceReference,
  invoiceTotal,
}) {
  const po =
    await supabase
      .from("purchase_orders")
      .select("*")
      .eq("id", purchaseOrderId)
      .single();

  const receipt =
    await supabase
      .from("goods_receipts")
      .select("*")
      .eq("id", goodsReceiptId)
      .single();

  const poTotal =
    Number(
      po.data?.po_total || 0
    );

  const receiptTotal =
    Number(
      receipt.data
        ?.receipt_total || 0
    );

  const invoice =
    Number(invoiceTotal || 0);

  const variance =
    invoice - poTotal;

  let status = "matched";

  if (
    Math.abs(variance) > 1
  ) {
    status = "variance_detected";
  }

  const { data, error } =
    await supabase
      .from(
        "procurement_three_way_match"
      )
      .insert({
        tenant_id: tenantId,
        purchase_order_id:
          purchaseOrderId,
        goods_receipt_id:
          goodsReceiptId,
        invoice_reference:
          invoiceReference,
        po_total: poTotal,
        receipt_total:
          receiptTotal,
        invoice_total:
          invoice,
        variance_amount:
          variance,
        match_status: status,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
