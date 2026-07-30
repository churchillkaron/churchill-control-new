import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { runEventProcessors } from "@/lib/workers/system/runEventProcessors";

function unavailableError(error, functionName) {
  return (
    error?.code === "PGRST202" ||
    String(error?.message || "").includes(functionName)
  );
}

export async function recordSystemEvent({
  organizationId,
  type,
  payload = {},
  idempotencyKey = null,
  dispatch = true,
}) {
  if (!organizationId) {
    return { success: false, error: "organizationId required" };
  }

  if (!type || !String(type).trim()) {
    return { success: false, error: "type required" };
  }

  const result = await supabaseAdmin.rpc("record_system_event_atomic", {
    p_organization_id: organizationId,
    p_type: String(type).trim(),
    p_payload: payload && typeof payload === "object" ? payload : {},
    p_idempotency_key: idempotencyKey ? String(idempotencyKey) : null,
  });

  if (result.error) {
    const error = unavailableError(result.error, "record_system_event_atomic")
      ? "Atomic system event recording is not deployed in the database"
      : result.error.message;

    console.error("[SYSTEM_EVENT_ERROR]", error);
    return { success: false, error };
  }

  const recorded = result.data || {};
  const event = recorded.event || null;
  let dispatchResult = null;

  if (dispatch && event?.id && !event.processed) {
    dispatchResult = await runEventProcessors({
      organizationId,
      eventId: event.id,
      limit: 1,
    });
  }

  const refreshed = event?.id
    ? await supabaseAdmin
        .from("system_events")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("id", event.id)
        .maybeSingle()
    : { data: event, error: null };

  if (refreshed.error) {
    console.error("[SYSTEM_EVENT_REFRESH_ERROR]", refreshed.error.message);
  }

  const currentEvent = refreshed.data || event;
  const dispatchFailed = Number(dispatchResult?.failed || 0) > 0;

  return {
    success: true,
    duplicate: Boolean(recorded.duplicate),
    skipped: Boolean(recorded.duplicate),
    reason: recorded.duplicate ? "duplicate_event" : null,
    event: currentEvent,
    dispatch: dispatchResult,
    dispatch_pending: Boolean(currentEvent && !currentEvent.processed),
    dispatch_error: dispatchFailed
      ? dispatchResult?.failures?.[0]?.error || "Event dispatch incomplete"
      : null,
  };
}
