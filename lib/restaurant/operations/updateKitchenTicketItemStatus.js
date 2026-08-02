import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACTIVE_TICKET_STATUSES = ["NEW", "IN_PROGRESS", "PREPARING", "READY"];
const ITEM_STATUSES = new Set([
  "NEW",
  "IN_PROGRESS",
  "PREPARING",
  "READY",
  "SERVED",
  "COMPLETED",
  "CANCELLED",
  "VOID",
]);

function normalizeStatus(value) {
  const status = String(value || "").trim().toUpperCase();

  if (status === "START" || status === "STARTED") return "PREPARING";
  if (status === "COMPLETE" || status === "COMPLETED") return "READY";
  if (status === "HANDOFF" || status === "HANDED_OFF") return "SERVED";
  return status;
}

function deriveTicketStatus(items) {
  const statuses = items.map((item) => normalizeStatus(item.status));

  if (
    statuses.length > 0 &&
    statuses.every((status) => status === "SERVED" || status === "COMPLETED")
  ) {
    return "COMPLETED";
  }

  if (
    statuses.length > 0 &&
    statuses.every((status) =>
      ["READY", "SERVED", "COMPLETED"].includes(status)
    )
  ) {
    return "READY";
  }

  if (
    statuses.some((status) =>
      ["PREPARING", "IN_PROGRESS"].includes(status)
    )
  ) {
    return "IN_PROGRESS";
  }

  return "NEW";
}

export async function updateKitchenTicketItemStatus({
  itemId,
  organizationId,
  status,
  ticketId = null,
}) {
  const normalizedStatus = normalizeStatus(status);

  if (!itemId || !normalizedStatus || !organizationId) {
    return {
      success: false,
      error: "itemId, status and organizationId required",
    };
  }

  if (!ITEM_STATUSES.has(normalizedStatus)) {
    return {
      success: false,
      error: `Unsupported restaurant fulfillment status: ${normalizedStatus}`,
    };
  }

  let query = supabaseAdmin
    .from("kitchen_tickets")
    .select("*")
    .eq("organization_id", organizationId);

  if (ticketId) {
    query = query.eq("id", ticketId);
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
      error: "Restaurant fulfillment item not found",
    };
  }

  const now = new Date().toISOString();
  const items = (Array.isArray(ticket.items) ? ticket.items : []).map((item) => {
    if (item.id !== itemId && item.order_item_id !== itemId) {
      return item;
    }

    return {
      ...item,
      status: normalizedStatus,
      updated_at: now,
      ...(["PREPARING", "IN_PROGRESS"].includes(normalizedStatus) &&
      !item.started_at
        ? { started_at: now }
        : {}),
      ...(normalizedStatus === "READY" ? { ready_at: now } : {}),
      ...(["SERVED", "COMPLETED"].includes(normalizedStatus)
        ? { served_at: now, completed_at: now }
        : {}),
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

  const item = items.find(
    (candidate) =>
      candidate.id === itemId || candidate.order_item_id === itemId
  );

  return {
    success: true,
    source_type: "restaurant_kitchen_ticket",
    source_id: ticket.id,
    work_item: item,
    queue_entry: data,
    completion_evidence:
      normalizedStatus === "READY"
        ? {
            type: "work_item_ready",
            recorded_at: now,
            source_id: itemId,
          }
        : normalizedStatus === "SERVED" || normalizedStatus === "COMPLETED"
          ? {
              type: "handoff_completed",
              recorded_at: now,
              source_id: itemId,
            }
          : null,
  };
}

export default updateKitchenTicketItemStatus;
