import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  emitEvent,
} from "@/lib/shared/events/eventBus";
import { getNextGRNNumber } from "@/lib/procurement/receiving/utils/getNextGRNNumber";
import { updatePurchaseOrderReceiptStatus } from "@/lib/procurement/receiving/updatePurchaseOrderReceiptStatus";

export default async function receivePurchaseOrder({
  tenant_id,
  purchase_order_id,
  received_by = "WAREHOUSE",
}) {

  try {

    if (!tenant_id) {
      throw new Error("tenant_id required");
    }

    // ===== LOAD PO =====
    const {
      data: po,
      error: poError,
    } = await supabaseAdmin
      .from("purchase_orders")
      .select(`
        *,
        purchase_order_items (*)
      `)
      .eq(
        "tenant_id",
        tenant_id
      )
      .eq(
        "id",
        purchase_order_id
      )
      .single();

    if (poError) {
      throw poError;
    }

    if (po.status === "RECEIVED") {
      throw new Error(
        "PURCHASE_ORDER_ALREADY_RECEIVED"
      );
    }

    if (po.status !== "APPROVED") {
      throw new Error(
        `PURCHASE_ORDER_NOT_APPROVED: ${po.status}`
      );
    }

    // ===== CREATE GOODS RECEIPT =====

    const grnNumber =
      await getNextGRNNumber({
        tenantId: po.tenant_id,
      });
    const {
      data: receipt,
      error: receiptError,
    } = await supabaseAdmin
      .from("goods_receipts")
      .insert([
        {

          tenant_id:
            po.tenant_id,

          grn_number:
            grnNumber,

          purchase_order_id:
            po.id,

          vendor_id:
            po.vendor_id,

          received_by,

          status:
            "RECEIVED",

          received_date:
            new Date().toISOString().slice(0,10),
        },
      ])
      .select()
      .single();

    if (receiptError) {
      throw receiptError;
    }

    // ===== PROCESS ITEMS =====
    for (const item of po.purchase_order_items || []) {

      // ===== UPDATE INVENTORY =====
      const {
        data: ingredient,
        error: ingredientError,
      } = await supabaseAdmin
        .from("ingredients")
        .select("*")
        .eq(
          "id",
          item.ingredient_id
        )
        .single();

      if (ingredientError) {
        throw ingredientError;
      }

      const previousQuantity =
        Number(
          ingredient.quantity || 0
        );

      const receivedQuantity =
        Number(
          item.quantity || 0
        );

      const newQuantity =
        previousQuantity +
        receivedQuantity;

      const {
        error: updateError,
      } = await supabaseAdmin
        .from("ingredients")
        .update({

          quantity:
            newQuantity,
        })
        .eq(
          "id",
          ingredient.id
        );

      if (updateError) {
        throw updateError;
      }

      // ===== GOODS RECEIPT ITEMS =====
      const {
        error: receiptItemError,
      } = await supabaseAdmin
        .from(
          "goods_receipt_items"
        )
        .insert([
          {

            tenant_id:
              po.tenant_id,

            goods_receipt_id:
              receipt.id,

            purchase_order_item_id:
              item.id,

            item_name:
              item.item_name,

            ordered_qty:
              item.qty,

            received_qty:
              receivedQuantity,

            damaged_qty:
              0,

            accepted_qty:
              receivedQuantity,

            created_at:
              new Date().toISOString(),
          },
        ]);

      if (receiptItemError) {
        throw receiptItemError;
      }

      // ===== UPDATE PO ITEM RECEIVED QTY =====
      const {
        error: poItemUpdateError,
      } = await supabaseAdmin
        .from("purchase_order_items")
        .update({
          received_qty:
            Number(item.qty || 0),
        })
        .eq(
          "id",
          item.id
        );

      if (poItemUpdateError) {
        throw poItemUpdateError;
      }

      // ===== INVENTORY LEDGER =====
      const {
        error: ledgerError,
      } = await supabaseAdmin
        .from(
          "inventory_ledger"
        )
        .insert([
          {

            tenant_id:
              po.tenant_id,

            ingredient_id:
              ingredient.id,

            ingredient_name:
              ingredient.name,

            movement_type:
              "GOODS_RECEIPT",

            quantity:
              receivedQuantity,

            previous_quantity:
              previousQuantity,

            new_quantity:
              newQuantity,

            reference_type:
              "GOODS_RECEIPT",

            reference_id:
              receipt.id,

            created_at:
              new Date().toISOString(),
          },
        ]);

      if (ledgerError) {
        throw ledgerError;
      }
    }
    // ===== ENTERPRISE EVENT =====

    await emitEvent(

      "GOODS_RECEIPT_CREATED",

      {

        tenantId:
          po.tenant_id,

        goodsReceiptId:
          receipt.id,

        purchaseOrderId:
          po.id,

        purchaseOrder:
          po,

        receivedBy:
          received_by,

      }

    );

    // ===== UPDATE PO RECEIPT STATUS =====
    await updatePurchaseOrderReceiptStatus({
      purchaseOrderId:
        po.id,
    });

    return {

      success: true,

      goods_receipt:
        receipt,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
