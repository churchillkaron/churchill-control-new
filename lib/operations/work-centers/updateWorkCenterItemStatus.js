import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACTIVE_TICKET_STATUSES = ["NEW", "IN_PROGRESS", "PREPARING", "READY"];

function deriveTicketStatus(items) {
  const statuses = items.map((item) => item.status);

  if (statuses.length > 0 && statuses.every((status) => status === "SERVED")) {
    return "COMPLETED";
  }

  if (
    statuses.length > 0 &&
    statuses.every((status) => status === "READY" || status === "SERVED")
  ) {
    return "READY";
  }

  if (statuses.some((status) => status === "PREPARING" || status === "IN_PROGRESS")) {
    return "IN_PROGRESS";
  }

  return "NEW";
}

export default async function updateWorkCenterItemStatus(body) {
  const itemId = body.itemId;
  const status = body.status;
  const organizationId = body.organizationId || body.organization_id;
  const requestedTicketId = body.ticketId || body.ticket_id || null;

  if (!itemId || !status || !organizationId) {
    return {
      success: false,
      error: "itemId, status and organizationId required",
    };
  }

  let query = supabaseAdmin
    .from("kitchen_tickets")
    .select("*")
    .eq("organization_id", organizationId);

  if (requestedTicketId) {
    query = query.eq("id", requestedTicketId);
  } else {
    query = query.in("status", ACTIVE_TICKET_STATUSES);
  }

  const { data: tickets, error: loadError } = await query;

  if (loadError) {
    return {
      success: false,
      error: loadError.message,
    };
  }

  const ticket = (tickets || []).find((candidate) =>
    (Array.isArray(candidate.items) ? candidate.items : []).some(
      (item) => item.id === itemId || item.order_item_id === itemId
    )
  );

  if (!ticket) {
    return {
      success: false,
      error: "Kitchen ticket item not found",
    };
  }

  const now = new Date().toISOString();
  const items = (Array.isArray(ticket.items) ? ticket.items : []).map((item) => {
    if (item.id !== itemId && item.order_item_id !== itemId) {
      return item;
    }

    return {
      ...item,
      status,
      updated_at: now,
      ...(status === "READY" ? { ready_at: now } : {}),
      ...(status === "SERVED" ? { served_at: now } : {}),
    };
  });

  const ticketStatus = deriveTicketStatus(items);
  const updates = {
    items,
    status: ticketStatus,
    updated_at: now,
  };

  if (ticketStatus === "IN_PROGRESS" && !ticket.started_at) {
    updates.started_at = now;
  }

  if (ticketStatus === "READY" && !ticket.ready_at) {
    updates.ready_at = now;
  }

  if (ticketStatus === "COMPLETED" && !ticket.completed_at) {
    updates.completed_at = now;
  }

  const { data, error } = await supabaseAdmin
    .from("kitchen_tickets")
    .update(updates)
    .eq("organization_id", organizationId)
    .eq("id", ticket.id)
    .select("*")
    .single();

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  return {
    success: true,
    item: items.find(
      (item) => item.id === itemId || item.order_item_id === itemId
    ),
    ticket: data,
  };
}
