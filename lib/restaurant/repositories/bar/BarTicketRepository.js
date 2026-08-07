import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function loadBarTicket({
  organizationId,
  ticketId,
}) {
  if (!organizationId || !ticketId) {
    throw new Error("organizationId and ticketId required");
  }

  const { data, error } = await supabaseAdmin
    .from("bar_tickets")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", ticketId)
    .single();

  if (error) throw error;
  return data;
}

export async function saveBarTicket({
  aggregate,
}) {
  const b = aggregate?.state;

  if (!b?.organizationId && !b?.organization_id) {
    throw new Error("Bar ticket organizationId required");
  }

  if (!b?.workCenterId && !b?.work_center_id) {
    throw new Error("Bar ticket workCenterId required");
  }

  const { data, error } = await supabaseAdmin
    .from("bar_tickets")
    .upsert({
      id: b.id,
      organization_id: b.organizationId || b.organization_id,
      order_id: b.orderId || b.order_id,
      session_id: b.sessionId || b.session_id,
      table_id: b.tableId || b.table_id,
      table_number: b.tableNumber || b.table_number,
      work_center_id: b.workCenterId || b.work_center_id,
      station: b.station || null,
      status: b.status,
      items: b.items || [],
      started_at: b.startedAt || b.started_at || null,
      ready_at: b.readyAt || b.ready_at || null,
      completed_at: b.completedAt || b.completed_at || null,
      created_at: b.createdAt || b.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createBarTicket({
  document,
}) {
  return saveBarTicket({
    aggregate: {
      state: document,
    },
  });
}
