import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function loadKitchenTicket({
  organizationId,
  ticketId,
}) {
  if (!organizationId || !ticketId) {
    throw new Error("organizationId and ticketId required");
  }

  const { data, error } = await supabaseAdmin
    .from("kitchen_tickets")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", ticketId)
    .single();

  if (error) throw error;

  return data;
}

export async function saveKitchenTicket({
  aggregate,
}) {
  const k = aggregate?.state;

  if (!k?.organizationId && !k?.organization_id) {
    throw new Error("Kitchen ticket organizationId required");
  }

  if (!k?.workCenterId && !k?.work_center_id) {
    throw new Error("Kitchen ticket workCenterId required");
  }

  const { data, error } = await supabaseAdmin
    .from("kitchen_tickets")
    .upsert({
      id: k.id,
      organization_id: k.organizationId || k.organization_id,
      order_id: k.orderId || k.order_id,
      session_id: k.sessionId || k.session_id,
      table_id: k.tableId || k.table_id,
      table_number: k.tableNumber || k.table_number,
      work_center_id: k.workCenterId || k.work_center_id,
      station: k.station || null,
      status: k.status,
      items: k.items || [],
      started_at: k.startedAt || k.started_at || null,
      ready_at: k.readyAt || k.ready_at || null,
      completed_at: k.completedAt || k.completed_at || null,
      created_at: k.createdAt || k.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function createKitchenTicket({
  document,
}) {
  return saveKitchenTicket({
    aggregate: {
      state: document,
    },
  });
}
