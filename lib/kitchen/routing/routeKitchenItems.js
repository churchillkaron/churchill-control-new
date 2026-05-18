import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import getKitchenStation from "@/lib/kitchen/stations/getKitchenStation";

export default async function routeKitchenItems({
  tenant_id,
  kitchen_ticket_id,
  items = [],
}) {

  try {

    const routedItems = [];

    for (const item of items) {

      // ===== GET DISH =====
      const {
        data: dish,
      } = await supabaseAdmin
        .from("dishes")
        .select("*")
        .eq(
          "id",
          item.dish_id
        )
        .single();

      const station =
        getKitchenStation(
          dish?.category || ""
        );

      const kitchenItem = {

        tenant_id,

        kitchen_ticket_id,

        item_name:
          item.item_name,

        quantity:
          item.quantity,

        station,

        status:
          "PENDING",

        created_at:
          new Date().toISOString(),
      };

      routedItems.push(
        kitchenItem
      );
    }

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        "kitchen_ticket_items"
      )
      .insert(
        routedItems
      )
      .select();

    if (error) {
      throw error;
    }

    return {

      success: true,

      routed_items:
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
