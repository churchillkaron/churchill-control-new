import {
  emitEvent,
} from "@/lib/shared/events/eventBus";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function replayEvents({
  organizationId,
  limit = 100,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const { data, error } = await supabaseAdmin
    .from("workflow_logs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("replayable", true)
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit || 100), 500)));

  if (error) {
    throw error;
  }

  const results = [];

  for (const log of data || []) {
    try {
      const result = await emitEvent(
        log.event,
        {
          ...(log.payload || {}),
          organizationId,
        }
      );

      results.push({
        success: true,
        logId: log.id,
        event: log.event,
        result,
      });
    } catch (error) {
      results.push({
        success: false,
        logId: log.id,
        event: log.event,
        error: error.message,
      });
    }
  }

  return results;
}
