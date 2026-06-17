import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

import { emitAccountingEvent } from "./emitAccountingEvent";

export async function replayAccountingEvent({
  tenantId,
  eventId,
  replayReason,
}) {
  const { data: event, error } =
    await supabase
      .from("accounting_event_bus")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", eventId)
      .single();

  if (error || !event) {
    throw new Error(
      "Original event not found"
    );
  }

  const { data: replay } =
    await supabase
      .from(
        "accounting_event_replays"
      )
      .insert({
        tenant_id: tenantId,
        original_event_id:
          eventId,
        replay_reason:
          replayReason,
      })
      .select()
      .single();

  const result =
    await emitAccountingEvent({
      tenantId,
      eventType:
        event.event_type,
      sourceModule:
        event.source_module,
      sourceId:
        `${event.source_id}-REPLAY`,
      payload: {
        ...event.payload,
        replayId:
          replay.id,
      },
    });

  await supabase
    .from(
      "accounting_event_replays"
    )
    .update({
      replay_status:
        "completed",
    })
    .eq("id", replay.id);

  return {
    replay,
    result,
  };
}
