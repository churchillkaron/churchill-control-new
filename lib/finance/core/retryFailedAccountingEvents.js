import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function retryFailedAccountingEvents({
  tenantId,
}) {
  const failed =
    await supabase
      .from(
        "accounting_event_failures"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("retry_status", "failed");

  const retried = [];

  for (const row of failed.data || []) {
    await supabase
      .from(
        "accounting_event_failures"
      )
      .update({
        retry_status:
          "retried",
        retried_at:
          new Date().toISOString(),
      })
      .eq("id", row.id);

    retried.push({
      id: row.id,
      event_type:
        row.event_type,
    });
  }

  return retried;
}
