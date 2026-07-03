import { supabase } from "@/lib/shared/supabase/client";

/**
 * POS Replay Engine
 * Industry-agnostic event replay.
 */

export async function replayEvents(organizationId) {
  const { data: events } = await supabase
    .from("pos_event_log")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  const state = {
    orders: {},
    fulfillment: {},
  };

  for (const event of events || []) {
    const payload = event.payload || {};

    switch (event.event_type) {
      case "ORDER_CREATED":
        state.orders[payload.orderId] = payload;
        break;

      case "ORDER_UPDATED":
        state.orders[payload.orderId] = {
          ...state.orders[payload.orderId],
          ...payload,
        };
        break;

      case "ITEM_UPDATED":
        if (!state.fulfillment[payload.orderId]) {
          state.fulfillment[payload.orderId] = [];
        }

        state.fulfillment[payload.orderId].push(payload);
        break;
    }
  }

  return state;
}
