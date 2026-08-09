import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { emitEvent } from "@/lib/shared/events/eventBus";

export async function replayDeadLetterQueue({
  organizationId,
  limit = 50,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const { data, error } = await supabaseAdmin
    .from("workflow_logs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("dead_letter", true)
    .eq("replayable", true)
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit || 50), 200)));

  if (error) {
    throw error;
  }

  const replayed = [];

  for (const row of data || []) {
    try {
      const result = await emitEvent(
        row.event || row.workflow,
        {
          ...(row.payload || {}),
          organizationId,
        }
      );

      const { error: updateError } = await supabaseAdmin
        .from("workflow_logs")
        .update({
          status: "REPLAYED",
          retry_count: Number(row.retry_count || 0) + 1,
          dead_letter: false,
          replayable: false,
          result,
          error: null,
          completed_at: new Date().toISOString(),
        })
        .eq("organization_id", organizationId)
        .eq("id", row.id);

      if (updateError) {
        throw updateError;
      }

      replayed.push({
        logId: row.id,
        success: true,
      });
    } catch (replayError) {
      const retryCount = Number(row.retry_count || 0) + 1;

      await supabaseAdmin
        .from("workflow_logs")
        .update({
          status: "FAILED",
          retry_count: retryCount,
          error: replayError.message,
        })
        .eq("organization_id", organizationId)
        .eq("id", row.id);

      replayed.push({
        logId: row.id,
        success: false,
        error: replayError.message,
      });
    }
  }

  return replayed;
}
