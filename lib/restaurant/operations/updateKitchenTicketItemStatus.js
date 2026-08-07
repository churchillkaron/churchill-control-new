import { recordSystemEvent } from "@/lib/events/recordSystemEvent";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { SYSTEM_EVENTS } from "@/lib/shared/constants/events";

const ACTIVE_TICKET_STATUSES = [
  "NEW",
  "IN_PROGRESS",
  "PREPARING",
  "READY",
  "SERVED",
];
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
  if (status === "HANDOFF" || status === "HANDED_OFF") return "SERVED";
  if (status === "COMPLETE" || status === "COMPLETED") return "COMPLETED";
  return status;
}

function deriveTicketStatus(items) {
  const statuses = items.map((item) => normalizeStatus(item.status));

  if (
    statuses.length > 0 &&
    statuses.every((status) => status === "COMPLETED")
  ) {
    return "COMPLETED";
  }

  if (
    statuses.length > 0 &&
    statuses.every((status) => ["SERVED", "COMPLETED"].includes(status))
  ) {
    return "SERVED";
  }

  if (
    statuses.length > 0 &&
    statuses.every((status) => ["READY", "SERVED", "COMPLETED"].includes(status))
  ) {
    return "READY";
  }

  if (
    statuses.some((status) => ["PREPARING", "IN_PROGRESS"].includes(status))
  ) {
    return "IN_PROGRESS";
  }

  return "NEW";
}

function evidenceForStatus(status, itemId, now) {
  if (status === "READY") {
    return {
      type: "work_item_ready",
      event_type: SYSTEM_EVENTS.RESTAURANT_WORK_ITEM_READY,
      recorded_at: now,
      source_id: itemId,
    };
  }

  if (status === "SERVED") {
    return {
      type: "handoff_completed",
      event_type: SYSTEM_EVENTS.RESTAURANT_HANDOFF_COMPLETED,
      recorded_at: now,
      source_id: itemId,
    };
  }

  if (status === "COMPLETED") {
    return {
      type: "work_item_completed",
      event_type: SYSTEM_EVENTS.RESTAURANT_WORK_ITEM_COMPLETED,
      recorded_at: now,
      source_id: itemId,
    };
  }

  return null;
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
      ...(normalizedStatus === "SERVED" ? { served_at: now } : {}),
      ...(normalizedStatus === "COMPLETED"
        ? {
            served_at: item.served_at || now,
            completed_at: now,
          }
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
    (candidate) => candidate.id === itemId || candidate.order_item_id === itemId
  );
  const completionEvidence = evidenceForStatus(normalizedStatus, itemId, now);
  let evidenceEvent = null;

  if (completionEvidence) {
    evidenceEvent = await recordSystemEvent({
      organizationId,
      type: completionEvidence.event_type,
      idempotencyKey: [
        "restaurant-kitchen",
        ticket.id,
        itemId,
        normalizedStatus,
      ].join(":"),
      payload: {
        source_domain: "restaurant",
        source_type: "restaurant_kitchen_ticket_item",
        source_id: itemId,
        evidence_type: completionEvidence.type,
        recorded_at: now,
        restaurant_status: normalizedStatus,
        ticket_id: ticket.id,
        order_id: ticket.order_id || null,
        session_id: ticket.session_id || null,
        table_id: ticket.table_id || null,
        table_number: ticket.table_number || null,
        work_center_id: ticket.work_center_id || null,
        item: item || null,
      },
      dispatch: true,
    });
  }

  return {
    success: true,
    source_type: "restaurant_kitchen_ticket",
    source_id: ticket.id,
    work_item: item,
    queue_entry: data,
    completion_evidence: completionEvidence
      ? {
          type: completionEvidence.type,
          recorded_at: completionEvidence.recorded_at,
          source_id: completionEvidence.source_id,
        }
      : null,
    evidence_event: completionEvidence
      ? {
          success: evidenceEvent?.success === true,
          event_id: evidenceEvent?.event?.id || null,
          duplicate: Boolean(evidenceEvent?.duplicate),
          dispatch_pending: Boolean(evidenceEvent?.dispatch_pending),
          error:
            evidenceEvent?.success === false
              ? evidenceEvent.error || "Evidence event recording failed"
              : evidenceEvent?.dispatch_error || null,
        }
      : null,
  };
}

export default updateKitchenTicketItemStatus;
