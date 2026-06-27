import { supabase } from "@/lib/supabase";

import { processAccountingEvent } from "@/lib/finance/general-ledger/workflows/processAccountingEvent";

export async function emitAccountingEvent({
  organization_id,
  entity_id,
  eventType,
  sourceModule,
  sourceId,
  payload,
}) {

  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!entity_id) {
    throw new Error("entity_id required");
  }
  const { data: event, error } = await supabase
    .from("accounting_event_bus")
    .insert({
      organization_id: organization_id,
      entity_id: entity_id,
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
