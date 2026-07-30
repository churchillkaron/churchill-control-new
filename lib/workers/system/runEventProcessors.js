import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { EVENT_SUBSCRIPTIONS } from "./eventSubscriptions";
import { processWorkCenterEvents } from "@/lib/workers/work-centers/processWorkCenterEvents";
import { processInventoryEvents } from "@/lib/workers/inventory/processInventoryEvents";
import { processFinanceEvents } from "@/lib/workers/finance/processFinanceEvents";

function assertProcessorSuccess(result, label) {
  if (result?.success === false) {
    throw new Error(`${label} failed: ${result.error || "unknown error"}`);
  }
}

function unavailableError(error) {
  return (
    error?.code === "PGRST202" ||
    /claim_system_events/i.test(error?.message || "")
  );
}

async function markProcessed(event) {
  const result = await supabaseAdmin
    .from("system_events")
    .update({
      processed: true,
      processing: false,
      processed_at: new Date().toISOString(),
      processing_started_at: null,
      last_error: null,
    })
    .eq("organization_id", event.organization_id)
    .eq("id", event.id)
    .eq("processing", true);

  if (result.error) throw result.error;
}

async function markFailed(event, error) {
  const result = await supabaseAdmin
    .from("system_events")
    .update({
      processing: false,
      processing_started_at: null,
      last_error: error?.message || String(error || "Event processing failed"),
      last_failed_at: new Date().toISOString(),
    })
    .eq("organization_id", event.organization_id)
    .eq("id", event.id);

  if (result.error) {
    console.error("[EVENT_FAILURE_STATE_ERROR]", result.error.message);
  }
}

export async function runEventProcessors({
  organizationId = null,
  eventId = null,
  limit = 50,
  staleAfterSeconds = 300,
} = {}) {
  const claim = await supabaseAdmin.rpc("claim_system_events", {
    p_limit: Math.max(1, Math.min(Number(limit || 50), 200)),
    p_organization_id: organizationId || null,
    p_event_id: eventId ? String(eventId) : null,
    p_stale_after_seconds: Math.max(30, Number(staleAfterSeconds || 300)),
  });

  if (claim.error) {
    const error = unavailableError(claim.error)
      ? "Atomic system event claiming is not deployed in the database"
      : claim.error.message;

    console.error("EVENT_ROUTER_ERROR:", error);
    return {
      success: false,
      processed: 0,
      failed: 0,
      failures: [],
      error,
    };
  }

  const events = Array.isArray(claim.data) ? claim.data : [];

  if (!events.length) {
    return {
      success: true,
      claimed: 0,
      processed: 0,
      failed: 0,
      failures: [],
    };
  }

  let processed = 0;
  const failures = [];

  for (const event of events) {
    try {
      const type = event.type;
      const runWorkCenter = EVENT_SUBSCRIPTIONS.WORK_CENTER.includes(type);
      const runInventory = EVENT_SUBSCRIPTIONS.INVENTORY.includes(type);
      const runFinance = EVENT_SUBSCRIPTIONS.FINANCE.includes(type);

      if (runWorkCenter) {
        assertProcessorSuccess(
          await processWorkCenterEvents([event]),
          "Work center processor"
        );
      }

      if (runInventory) {
        assertProcessorSuccess(
          await processInventoryEvents([event]),
          "Inventory processor"
        );
      }

      if (runFinance) {
        assertProcessorSuccess(
          await processFinanceEvents([event]),
          "Finance processor"
        );
      }

      await markProcessed(event);
      processed += 1;
    } catch (error) {
      console.error("[EVENT_PROCESS_ERROR]", error);
      await markFailed(event, error);
      failures.push({
        eventId: event.id,
        organizationId: event.organization_id,
        type: event.type,
        attemptCount: Number(event.attempt_count || 0),
        error: error?.message || "Event processing failed",
      });
    }
  }

  return {
    success: failures.length === 0,
    claimed: events.length,
    processed,
    failed: failures.length,
    failures,
    error: failures.length ? "One or more events failed" : null,
  };
}
