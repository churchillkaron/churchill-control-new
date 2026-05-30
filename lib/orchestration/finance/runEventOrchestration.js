import { supabase } from "@/lib/supabase";

import { emitAccountingEvent } from "./emitAccountingEvent";

export async function runEventOrchestration({
  tenantId,
  parentEvent,
}) {
  const { data: routes, error } =
    await supabase
      .from("accounting_event_routes")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq(
        "parent_event_type",
        parentEvent.event_type
      )
      .eq("is_active", true)
      .order("execution_order", {
        ascending: true,
      });

  if (error) {
    throw error;
  }

  const results = [];

  for (const route of routes || []) {
    const result =
      await emitAccountingEvent({
        tenantId,
        eventType:
          route.child_event_type,
        sourceModule:
          parentEvent.source_module,
        sourceId:
          parentEvent.source_id,
        payload: {
          ...parentEvent.payload,
          parentEventId:
            parentEvent.id,
        },
      });

    results.push({
      route:
        route.child_event_type,
      result,
    });
  }

  return results;
}
