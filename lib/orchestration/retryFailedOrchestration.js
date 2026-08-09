import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { runEventProcessors } from "@/lib/workers/system/runEventProcessors";

export async function retryFailedOrchestration({
  organizationId,
  limit = 50,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const { data, error } = await supabaseAdmin
    .from("system_events")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("processed", false)
    .not("last_error", "is", null)
    .order("last_failed_at", { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit || 50), 200)));

  if (error) {
    throw error;
  }

  const retried = [];

  for (const event of data || []) {
    const result = await runEventProcessors({
      organizationId,
      eventId: event.id,
      limit: 1,
    });

    retried.push({
      eventId: event.id,
      success: result?.success !== false,
      processed: Number(result?.processed || 0),
      failed: Number(result?.failed || 0),
      error: result?.error || null,
    });
  }

  return retried;
}
