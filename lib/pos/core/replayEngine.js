
import { supabase } from "@/lib/shared/supabase/client";

/**
 * REPLAY ENGINE
 * Rebuilds system state from event log
 */

export async function replayEvents(tenantId) {

  const { data: events } = await supabase
    .from("pos_event_log")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  const state = {
    orders: {},
    kitchen: {},
    bar: {},
    expo: {}
  };

  for (const event of events || []) {

    const payload = event.payload;

    switch (event.event_type) {

      case "ORDER_CREATED":
        state.orders[payload.orderId] = payload;
        break;

      case "ORDER_UPDATED":
        state.orders[payload.orderId] = {
          ...state.orders[payload.orderId],
          ...payload
        };
        break;

      case "ITEM_UPDATED":
        if (!state.kitchen[payload.orderId]) {
          state.kitchen[payload.orderId] = [];
        }
        state.kitchen[payload.orderId].push(payload);
        break;
    }
  }

  return state;
}

