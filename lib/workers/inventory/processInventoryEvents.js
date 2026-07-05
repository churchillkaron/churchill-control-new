import { createInventoryMovement } from "@/lib/inventory/ledger/capabilities/createInventoryMovement";

/**
 * PURE INVENTORY WORKER
 * No DB queries inside
 * Only processes injected events
 */
export async function processInventoryEvents(events = []) {
  try {
    if (!events.length) {
      return { success: true, processed: 0 };
    }

    let processed = 0;

    for (const event of events) {
      const payload = event.payload || {};
      const type = event.type;

      const items = payload.items || [];
      const organizationId = payload.organization_id;
      const orderId = payload.order_id;

      if (!organizationId || !items.length) {
        continue;
      }

      // Only react to relevant event types
      if (type === "ORDER_ITEM_ADDED" || type === "ORDER_COMPLETED") {
        for (const item of items) {
          await createInventoryMovement({
            organization_id: organizationId,
            reference_type: "ORDER",
            reference_id: orderId,
            item_id: item.id,
            quantity: item.quantity || 1,
            movement_type: "CONSUME",
            metadata: {
              source: "EVENT_ENGINE",
              event_id: event.id
            }
          });
        }

        processed++;
      }
    }

    return {
      success: true,
      processed
    };

  } catch (error) {
    console.error("[INVENTORY_WORKER_ERROR]", error);

    return {
      success: false,
      error: error.message
    };
  }
}
