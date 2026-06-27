
import { supabase } from "@/lib/shared/supabase/client";
import { resolveConflict } from "./conflictResolver";

/**
 * REPLAY ENGINE V2 (CONFLICT SAFE)
 */

export async function replayEvents(organizationId) {

  const { data: events } = await supabase
    .from("pos_event_log")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  const state = {
    orders: {}
  };

  for (const event of events || []) {

    const payload = event.payload;

    const existing = state.orders[payload.orderId];

    if (!existing) {
      state.orders[payload.orderId] = payload;
      continue;
    }

    state.orders[payload.orderId] =
      resolveConflict(existing, payload);
  }

  return state;
}

