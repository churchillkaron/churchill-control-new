import { supabase } from "@/lib/supabase";

import { getPostingRule } from "./getPostingRule";
import { postJournalEntrySafe } from "./postJournalEntrySafe";

export async function emitAccountingEvent({
  tenantId,
  eventType,
  sourceModule,
  sourceId,
  payload,
}) {
  const { data: event, error } = await supabase
    .from("accounting_event_bus")
    .insert({
      tenant_id: tenantId,
      event_type: eventType,
      source_module: sourceModule,
      source_id: sourceId,
      payload,
      status: "processing",
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  try {
    const journal =
      await processAccountingEvent({
        event,
      });

    await supabase
      .from("accounting_event_bus")
      .update({
        status: "posted",
        processed_at: new Date().toISOString(),
      })
      .eq("id", event.id);

    return {
      event,
      journal,
    };
  } catch (postingError) {
    await supabase
      .from("accounting_event_bus")
      .update({
        status: "failed",
        error_message: postingError.message,
      })
      .eq("id", event.id);

    throw postingError;
  }
}
