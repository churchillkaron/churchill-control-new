import { recordSystemEvent } from "@/lib/events/recordSystemEvent";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { SYSTEM_EVENTS } from "@/lib/shared/constants/events";

const SOURCES = Object.freeze({
  kitchen: Object.freeze({
    rpcSourceType: "restaurant_kitchen_ticket",
    eventPrefix: "restaurant-kitchen",
    evidenceSourceType: "restaurant_kitchen_ticket_item",
  }),
  bar: Object.freeze({
    rpcSourceType: "restaurant_bar_ticket",
    eventPrefix: "restaurant-bar",
    evidenceSourceType: "restaurant_bar_ticket_item",
  }),
});

function normalizeStatus(value) {
  const status = String(value || "").trim().toUpperCase();
  if (status === "START" || status === "STARTED") return "PREPARING";
  if (status === "HANDOFF" || status === "HANDED_OFF") return "SERVED";
  if (status === "COMPLETE") return "COMPLETED";
  return status;
}

function evidenceForStatus(status, itemId, now) {
  if (status === "READY") {
    return {
      type: "work_item_ready",
      eventType: SYSTEM_EVENTS.RESTAURANT_WORK_ITEM_READY,
      recordedAt: now,
      sourceId: itemId,
    };
  }

  if (status === "SERVED") {
    return {
      type: "handoff_completed",
      eventType: SYSTEM_EVENTS.RESTAURANT_HANDOFF_COMPLETED,
      recordedAt: now,
      sourceId: itemId,
    };
  }

  if (status === "COMPLETED") {
    return {
      type: "work_item_completed",
      eventType: SYSTEM_EVENTS.RESTAURANT_WORK_ITEM_COMPLETED,
      recordedAt: now,
      sourceId: itemId,
    };
  }

  return null;
}

export async function transitionRestaurantFulfillmentItem({
  sourceKind,
  itemId,
  organizationId,
  entityId,
  status,
  ticketId = null,
  actorId = null,
}) {
  const source = SOURCES[sourceKind];
  const normalizedStatus = normalizeStatus(status);

  if (!source) {
    return { success: false, error: "Unsupported restaurant fulfillment source" };
  }

  if (!itemId || !organizationId || !entityId || !normalizedStatus) {
    return {
      success: false,
      error: "itemId, status, organizationId and entityId required",
    };
  }

  if (!ticketId) {
    return { success: false, error: "ticketId required for fulfillment transition" };
  }

  const transition = await supabaseAdmin.rpc(
    "restaurant_transition_fulfillment_item_atomic",
    {
      p_organization_id: organizationId,
      p_entity_id: entityId,
      p_source_type: source.rpcSourceType,
      p_ticket_id: ticketId,
      p_item_id: itemId,
      p_status: normalizedStatus,
      p_actor_id: actorId,
    }
  );

  if (transition.error) {
    return { success: false, error: transition.error.message };
  }

  const result = transition.data || {};
  const workItem = result.work_item || null;
  const effectiveStatus = normalizeStatus(result.status || normalizedStatus);
  const now = result.recorded_at || new Date().toISOString();
  const completionEvidence = evidenceForStatus(effectiveStatus, itemId, now);
  let evidenceEvent = null;

  if (completionEvidence) {
    evidenceEvent = await recordSystemEvent({
      organizationId,
      type: completionEvidence.eventType,
      idempotencyKey: [
        source.eventPrefix,
        ticketId,
        itemId,
        effectiveStatus,
      ].join(":"),
      payload: {
        organization_id: organizationId,
        entity_id: entityId,
        source_domain: "restaurant",
        source_type: source.evidenceSourceType,
        source_id: itemId,
        evidence_type: completionEvidence.type,
        recorded_at: now,
        restaurant_status: effectiveStatus,
        ticket_id: ticketId,
        order_id: result.order_id || null,
        session_id: result.session_id || null,
        table_id: result.table_id || null,
        table_number: result.table_number || null,
        work_center_id: result.work_center_id || null,
        actor_id: actorId,
        item: workItem,
      },
      dispatch: true,
    });
  }

  return {
    success: true,
    duplicate: result.duplicate === true,
    source_type: source.rpcSourceType,
    source_id: ticketId,
    entity_id: entityId,
    work_item: workItem,
    queue_entry: result.ticket || null,
    completion_evidence: completionEvidence
      ? {
          type: completionEvidence.type,
          recorded_at: completionEvidence.recordedAt,
          source_id: completionEvidence.sourceId,
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

export default transitionRestaurantFulfillmentItem;
