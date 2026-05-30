import { supabase } from "@/lib/supabase";

export async function retryFailedOrchestration({
  tenantId,
}) {
  const failed =
    await supabase
      .from(
        "orchestration_execution_logs"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq(
        "execution_status",
        "failed"
      );

  const retried = [];

  for (const row of failed.data || []) {
    await supabase
      .from(
        "orchestration_execution_logs"
      )
      .update({
        execution_status:
          "retried",
      })
      .eq("id", row.id);

    await supabase
      .from(
        "orchestration_recovery_logs"
      )
      .insert({
        tenant_id: tenantId,
        orchestration_id:
          row.id,
        recovery_action:
          "RETRY",
      });

    retried.push(row.id);
  }

  return retried;
}
