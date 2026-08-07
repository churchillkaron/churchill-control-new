import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { SYSTEM_EVENTS } from "@/lib/shared/constants/events";

const RESTAURANT_EVIDENCE_EVENTS = new Set([
  SYSTEM_EVENTS.RESTAURANT_WORK_ITEM_READY,
  SYSTEM_EVENTS.RESTAURANT_HANDOFF_COMPLETED,
  SYSTEM_EVENTS.RESTAURANT_WORK_ITEM_COMPLETED,
]);

function requireText(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} required`);
  return normalized;
}

function evidenceName(payload = {}) {
  const itemName = payload?.item?.item_name || payload?.item?.name || "Restaurant work item";
  const evidenceType = String(payload?.evidence_type || "evidence").replaceAll("_", " ");
  return `${itemName} — ${evidenceType}`;
}

export async function processOperationsEvidenceEvents(events = []) {
  let processed = 0;

  for (const event of events || []) {
    if (!RESTAURANT_EVIDENCE_EVENTS.has(event?.type)) continue;

    const organizationId = requireText(event.organization_id, "organization_id");
    const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
    const sourceId = requireText(payload.source_id, "source_id");
    const evidenceType = requireText(payload.evidence_type, "evidence_type");
    const commandKey = [
      organizationId,
      "global",
      "completion-evidence",
      "record",
      "system-event",
      event.id,
    ].join(":");

    const result = await supabaseAdmin.rpc("execute_operations_command", {
      p_organization_id: organizationId,
      p_entity_id: null,
      p_period_id: null,
      p_capability_id: "completion-evidence",
      p_record_type: "evidence",
      p_command: "record",
      p_command_key: commandKey,
      p_payload: {
        name: evidenceName(payload),
        code: null,
        description: `Restaurant fulfillment evidence: ${evidenceType}`,
        priority: "normal",
        source_domain: "restaurant",
        source_type: payload.source_type || "restaurant_kitchen_ticket_item",
        source_id: sourceId,
        attributes: {
          _operations_lifecycle: "evidence",
          evidence_type: evidenceType,
          recorded_at: payload.recorded_at || event.created_at || null,
          restaurant_status: payload.restaurant_status || null,
          source_event_id: event.id,
          ticket_id: payload.ticket_id || null,
          order_id: payload.order_id || null,
          session_id: payload.session_id || null,
          table_id: payload.table_id || null,
          table_number: payload.table_number || null,
          work_center_id: payload.work_center_id || null,
          restaurant_item: payload.item || null,
        },
      },
    });

    if (result.error) throw result.error;
    if (!result.data?.ok) {
      throw new Error(result.data?.error || "Operations evidence projection failed");
    }

    const publish = await supabaseAdmin.rpc("publish_operations_event_batch", {
      p_organization_id: organizationId,
      p_limit: 50,
    });

    if (publish.error) throw publish.error;
    processed += 1;
  }

  return {
    success: true,
    processed,
  };
}

export default processOperationsEvidenceEvents;
