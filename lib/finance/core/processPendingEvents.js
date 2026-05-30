import { supabase } from "@/lib/supabase";

import { emitAccountingEvent } from "./emitAccountingEvent";

export async function processPendingEvents({
  tenantId,
}) {
  const { data: events, error } =
    await supabase
      .from("accounting_event_bus")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .order("created_at", {
        ascending: true,
      });

  if (error) {
    throw error;
  }

  const results = [];

  for (const event of events || []) {
    try {
      const result =
        await emitAccountingEvent({
          tenantId:
            event.tenant_id,
          eventType:
            event.event_type,
          sourceModule:
            event.source_module,
          sourceId:
            event.source_id,
          payload:
            event.payload,
        });

      results.push({
        eventId: event.id,
        status: "processed",
        result,
      });
    } catch (processingError) {
      results.push({
        eventId: event.id,
        status: "failed",
        error:
          processingError.message,
      });
    }
  }

  return results;
}
