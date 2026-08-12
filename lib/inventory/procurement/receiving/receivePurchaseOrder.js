import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { emitEvent } from "@/lib/shared/events/eventBus";
import { getNextGRNNumber } from "@/lib/inventory/procurement/receiving/utils/getNextGRNNumber";
import { updatePurchaseOrderReceiptStatus } from "@/lib/inventory/procurement/receiving/updatePurchaseOrderReceiptStatus";
import { createInventoryMovement } from "@/lib/inventory/movements/createInventoryMovement";
import { createWarehouseTask } from "@/lib/operations/tasks/createWarehouseTask";

export default async function receivePurchaseOrder({
  organization_id,
  entity_id = null,
  purchase_order_id,
  received_by = "WAREHOUSE",
  actor_id = null,
}) {
  try {
    if (!organization_id) throw new Error("organization_id required");
    if (!purchase_order_id) throw new Error("purchase_order_id required");
    if (!actor_id) throw new Error("actor_id required");

    const { data: po, error: poError } = await supabaseAdmin
      .from("purchase_orders")
      .select(`
        *,
        purchase_order_items (*)
      `)
      .eq("organization_id", organization_id)
      .eq("id", purchase_order_id)
      .single();

    if (poError) throw poError;

    const resolvedEntityId = po.entity_id || entity_id || null;
    if (!resolvedEntityId) throw new Error("entity_id required");
    if (po.entity_id && entity_id && po.entity_id !== entity_id) {
      throw new Error("purchase order belongs to a different legal entity");
    }

    if (po.status === "RECEIVED") {
      throw new Error("PURCHASE_ORDER_ALREADY_RECEIVED");
    }
    if (po.status !== "APPROVED") {
      throw new Error(`PURCHASE_ORDER_NOT_APPROVED: ${po.status}`);
    }
    if (!po.warehouse_id) {
      throw new Error("purchase order warehouse_id required for receiving");
    }

    const grnNumber = await getNextGRNNumber({
      organizationId: organization_id,
    });

    const { data: receipt, error: receiptError } = await supabaseAdmin
      .from("goods_receipts")
      .insert({
        organization_id,
        entity_id: resolvedEntityId,
        grn_number: grnNumber,
        purchase_order_id: po.id,
        supplier_party_id: po.supplier_party_id,
        warehouse_id: po.warehouse_id,
        received_by,
        status: "RECEIVED",
        received_date: new Date().toISOString().slice(0, 10),
      })
      .select()
      .single();

    if (receiptError) throw receiptError;

    const movements = [];
    const tasks = [];

    for (const item of po.purchase_order_items || []) {
      if (item.organization_id && item.organization_id !== organization_id) {
        throw new Error("purchase order item belongs to a different organization");
      }
      if (item.entity_id && item.entity_id !== resolvedEntityId) {
        throw new Error("purchase order item belongs to a different legal entity");
      }

      const receivedQuantity = Number(
        item.quantity || item.qty || item.ordered_qty || 0,
      );
      if (receivedQuantity <= 0) continue;

      const unitCost = Number(
        item.unit_cost || item.unit_price || item.price || item.cost || 0,
      );

      const { error: receiptItemError } = await supabaseAdmin
        .from("goods_receipt_items")
        .insert({
          organization_id,
          entity_id: resolvedEntityId,
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

      const { error: poItemUpdateError } = await supabaseAdmin
        .from("purchase_order_items")
        .update({ received_qty: receivedQuantity })
        .eq("organization_id", organization_id)
        .eq("id", item.id);

      if (poItemUpdateError) throw poItemUpdateError;

      if (!item.item_id) continue;

      const task = await createWarehouseTask({
        organization_id,
        entity_id: resolvedEntityId,
        warehouse_id: po.warehouse_id,
        task_type: "PUTAWAY",
        source_document: "goods_receipts",
        source_document_id: receipt.id,
        item_id: item.item_id,
        quantity: receivedQuantity,
        created_by: actor_id,
      });
      tasks.push(task);

      const movement = await createInventoryMovement({
        organizationId: organization_id,
        entityId: resolvedEntityId,
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
        createdBy: actor_id,
        postToFinance: true,
      });
      movements.push(movement);
    }

    await emitEvent("GOODS_RECEIPT_CREATED", {
      organizationId: organization_id,
      entityId: resolvedEntityId,
      goodsReceiptId: receipt.id,
      purchaseOrderId: po.id,
      purchaseOrder: po,
      receivedBy: received_by,
      actorId: actor_id,
    });

    await updatePurchaseOrderReceiptStatus({ purchaseOrderId: po.id });

    return {
      success: true,
      goods_receipt: receipt,
      warehouse_tasks: tasks,
      inventory_movements: movements,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
