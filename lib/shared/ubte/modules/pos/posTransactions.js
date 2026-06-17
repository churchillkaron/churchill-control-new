import { createServerSupabase } from "@/lib/shared/supabase/server";
import { executeTransaction } from "@/lib/shared/ubte/executeTransaction";
import { POS_EVENTS } from "@/lib/shared/realtime/posEventBus";

/**
 * POS UBTE TRANSACTION MODULE
 * Single source of truth for POS order item writes
 */

export function addItemTransaction({ tenant_id, order_id, item }) {
  const supabase = createServerSupabase();

  return executeTransaction({
    tenant_id,
    domain: "pos",
    order_id,
    event: POS_EVENTS.ORDER_UPDATED,
    action: "pos.add_item",

    db: async () => {
      return await supabase
        .from("pos_order_items")
        .insert({
          order_id,
          ...item
        })
        .select()
        .single();
    },

    payload: {
      item
    }
  });
}
