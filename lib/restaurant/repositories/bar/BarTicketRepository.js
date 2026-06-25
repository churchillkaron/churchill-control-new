import {
  getDefaultWorkCenter,
} from "@/lib/restaurant/settings/WorkCenterRepository";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function saveBarTicket({
  aggregate,
}) {

  const b =
    aggregate.state;

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("bar_tickets")
    .upsert({

      id:
        b.id,

      organization_id:
        b.organizationId,

      order_id:
        b.orderId,

      session_id:
        b.sessionId,

      table_id:
        b.tableId,

      table_number:
        b.tableNumber,

      // station resolved from work center
    station:
        b.station,

      status:
        b.status,

      items:
        b.items,

      started_at:
        b.startedAt,

      ready_at:
        b.readyAt,

      completed_at:
        b.completedAt,

      created_at:
        b.createdAt,

      updated_at:
        b.updatedAt,

    })
    .select()
    .single();

  if (error)
    throw error;

  return data;

}
