import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getWorkCenterOrders({
  tenantId,
  workCenterId = null,
}) {
  if (!tenantId) {
    return {
      success: false,
      error: "Missing tenantId",
      data: [],
    };
  }

  let ticketQuery = supabaseAdmin
    .from("work_center_tickets")
    .select(`
      *,
      work_centers (
        id,
        name,
        code
      )
    `)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (workCenterId) {
    ticketQuery = ticketQuery.eq(
      "work_center_id",
      workCenterId
    );
  }

  const {
    data: tickets,
    error: ticketsError,
  } = await ticketQuery;

  if (ticketsError) {
    return {
      success: false,
      error: ticketsError.message,
      data: [],
    };
  }

  const ticketIds =
    (tickets || []).map(ticket => ticket.id);

  let items = [];

  if (ticketIds.length) {
    const { data, error } = await supabaseAdmin
      .from("work_center_ticket_items")
      .select(`
        *,
        work_centers (
          id,
          name,
          code
        )
      `)
      .in("work_center_ticket_id", ticketIds)
      .order("created_at", { ascending: true });

    if (error) {
      return {
        success: false,
        error: error.message,
        data: [],
      };
    }

    items = data || [];
  }

  const data =
    (tickets || []).map(ticket => ({
      ...ticket,
      work_center:
        ticket.work_centers || null,
      order_items:
        items.filter(
          item =>
            item.work_center_ticket_id === ticket.id
        ),
    }));

  return {
    success: true,
    data,
  };
}
