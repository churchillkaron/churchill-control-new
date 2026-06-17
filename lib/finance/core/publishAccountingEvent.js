import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function publishAccountingEvent({
  tenantId,
  eventType,
  eventPayload,
}) {
  const { data, error } =
    await supabase
      .from("accounting_event_bus")
      .insert({
        tenant_id: tenantId,
        event_type: eventType,
        event_payload:
          eventPayload,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
