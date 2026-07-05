import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { emitEvent } from "@/lib/shared/events/eventBus";
import { getNextGRNNumber } from "@/lib/procurement/receiving/utils/getNextGRNNumber";
import { updatePurchaseOrderReceiptStatus } from "@/lib/procurement/receiving/updatePurchaseOrderReceiptStatus";
import { createInventoryMovement } from "@/lib/inventory/movements/createInventoryMovement";

export default async function receivePurchaseOrder({
  organization_id,
  entity_id,
  purchase_order_id,
  received_by = "WAREHOUSE",
}) {
  try {
    if (!organization_id) {
      throw new Error("organization_id required");
    }

    const { data: po, error: poError } =
      await supabaseAdmin
        .from("purchase_orders")
        .select(`
          *,
          purchase_order_items (*)
        `)
        .eq("organization_id", organization_id)
        .eq("id", purchase_order_id)
        .single();

    if (poError) throw poError;

    if (po.status === "RECEIVED") {
      throw new Error("PURCHASE_ORDER_ALREADY_RECEIVED");
    }

    if (po.status !== "APPROVED") {
      throw new Error(`PURCHASE_ORDER_NOT_APPROVED: ${po.status}`);
    }

    const grnNumber =
      await getNextGRNNumber({
        organizationId: organization_id,
      });

    const { data: receipt, error: receiptError } =
      await supabaseAdmin
        .from("goods_receipts")
        .insert({
          organization_id,
          entity_id,
          grn_number: grnNumber,
          purchase_order_id: po.id,
          vendor_id: po.vendor_id,
          received_by,
          status: "RECEIVED",
          received_date: new Date().toISOString().slice(0, 10),
        })
        .select()
        .single();

    if (receiptError) throw receiptError;

    const movements = [];

    for (const item of po.purchase_order_items || []) {
      const receivedQuantity =
        Number(item.quantity || item.qty || item.ordered_qty || 0);

      if (receivedQuantity <= 0) {
        continue;
      }

      const unitCost =
        Number(
          item.unit_cost ||
          item.unit_price ||
          item.price ||
          item.cost ||
          0
        );

      const { error: receiptItemError } =
        await supabaseAdmin
          .from("goods_receipt_items")
          .insert({
            organization_id,
            entity_id,
            goods_receipt_id: receipt.id,
            purchase_order_item_id: item.id,
            item_name: item.item_name,
            ordered_qty: Number(item.qty || item.quantity || 0),
            received_qty: receivedQuantity,
            damaged_qty: 0,
            accepted_qty: receivedQuantity,
            created_at: new Date().toISOString(),
          });

      if (receiptItemError) throw receiptItemError;

      const { error: poItemUpdateError } =
        await supabaseAdmin
          .from("purchase_order_items")
          .update({
            received_qty: receivedQuantity,
          })
          .eq("id", item.id);

      if (poItemUpdateError) throw poItemUpdateError;

      if (item.item_id) {
        const movement =
          await createInventoryMovement({
            organizationId: organization_id,
            entityId: entity_id,
            itemId: item.item_id,
            movementType: "GOODS_RECEIPT",
            quantity: receivedQuantity,
            unitCost,
            referenceType: "GOODS_RECEIPT",
            referenceId: receipt.id,
            sourceModule: "procurement",
            sourceDocument: "goods_receipts",
            sourceDocumentId: receipt.id,
            notes: `Goods receipt ${grnNumber}`,
            createdBy: received_by,
            postToFinance: Boolean(entity_id),
          });

        movements.push(movement);
      }
    }

    await emitEvent("GOODS_RECEIPT_CREATED", {
      organizationId: organization_id,
      entityId: entity_id,
      goodsReceiptId: receipt.id,
      purchaseOrderId: po.id,
      purchaseOrder: po,
      receivedBy: received_by,
    });

    await updatePurchaseOrderReceiptStatus({
      purchaseOrderId: po.id,
    });

    return {
      success: true,
      goods_receipt: receipt,
      inventory_movements: movements,
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
