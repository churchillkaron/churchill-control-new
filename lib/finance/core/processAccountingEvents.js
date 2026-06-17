import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function processAccountingEvents({
  tenantId,
}) {
  const events =
    await supabase
      .from("accounting_event_bus")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq(
        "processing_status",
        "pending"
      );

  const processed = [];

  for (const event of events.data || []) {
    try {
      await supabase
        .from(
          "accounting_event_processing_logs"
        )
        .insert({
          tenant_id: tenantId,
          event_id: event.id,
          event_type:
            event.event_type,
          processing_result:
            "success",
        });

      await supabase
        .from(
          "accounting_event_bus"
        )
        .update({
          processing_status:
            "processed",
          processed_at:
            new Date().toISOString(),
        })
        .eq("id", event.id);

      processed.push(event.id);
    } catch (error) {
      await supabase
        .from(
          "accounting_event_failures"
        )
        .insert({
          tenant_id: tenantId,
          event_id: event.id,
          event_type:
            event.event_type,
          failure_reason:
            error.message,
        });
    }
  }

  return processed;
}
