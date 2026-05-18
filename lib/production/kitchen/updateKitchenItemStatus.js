import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import processInventoryConsumption from "@/lib/production/consumption/processInventoryConsumption";

import processPreparedInventoryConsumption from "@/lib/production/prepared/processPreparedInventoryConsumption";

export default async function updateKitchenItemStatus({
  item_id,
  status,
}) {

  try {

    const {
      data: currentItem,
      error: currentError,
    } = await supabaseAdmin
      .from(
        "kitchen_ticket_items"
      )
      .select(`
        *,
        kitchen_tickets (
          tenant_id,
          order_id
        )
      `)
      .eq(
        "id",
        item_id
      )
      .single();

    if (currentError) {
      throw currentError;
    }

    const updateData = {

      status,
    };

    if (
      status === "FIRED"
    ) {

      updateData.fire_time =
        new Date().toISOString();
    }

    if (
      status === "READY"
    ) {

      updateData.ready_time =
        new Date().toISOString();
    }

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        "kitchen_ticket_items"
      )
      .update(
        updateData
      )
      .eq(
        "id",
        item_id
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    // ===== CONSUME INVENTORY =====
    if (
      status === "READY"
    ) {

      const {
        data: orderItem,
      } = await supabaseAdmin
        .from(
          "order_items"
        )
        .select(`
          id,
          dish_id,
          quantity
        `)
        .eq(
          "order_id",
          currentItem.kitchen_tickets.order_id
        )
        .eq(
          "item_name",
          currentItem.item_name
        )
        .single();

      if (
        orderItem?.dish_id
      ) {

        // ===== RAW INGREDIENTS =====
        await processInventoryConsumption({

          tenant_id:
            currentItem
              .kitchen_tickets
              .tenant_id,

          order_item_id:
            orderItem.id,

          dish_id:
            orderItem.dish_id,

          quantity:
            orderItem.quantity,
        });

        // ===== PREPARED INVENTORY =====
        await processPreparedInventoryConsumption({

          tenant_id:
            currentItem
              .kitchen_tickets
              .tenant_id,

          order_item_id:
            orderItem.id,

          dish_id:
            orderItem.dish_id,

          quantity:
            orderItem.quantity,
        });
      }
    }

    return {

      success: true,

      item:
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
