import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function createKitchenTicket({
  document,
}) {

  const payload = {
    organization_id:
      document.organizationId,

    order_id:
      document.orderId,

    session_id:
      document.sessionId,

    table_id:
      document.tableId,

    table_number:
      document.tableNumber,

    station:
      document.station,

    status:
      document.status,

    items:
      document.items,

    started_at:
      document.startedAt,

    ready_at:
      document.readyAt,

    completed_at:
      document.completedAt,

    created_at:
      document.createdAt,

    updated_at:
      document.updatedAt,
  };

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("kitchen_tickets")
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
