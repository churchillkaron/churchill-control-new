import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

import { retryFailedAccountingEvents } from "./retryFailedAccountingEvents";

export async function approveSelfHealingAction({
  tenantId,
  actionId,
}) {
  const { data: action, error } =
    await supabase
      .from(
        "accounting_self_healing_actions"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", actionId)
      .single();

  if (error || !action) {
    throw new Error(
      "Self-healing action not found"
    );
  }

  let executionResult = null;

  if (
    action.auto_fix_payload
      ?.action ===
    "retry_event"
  ) {
    executionResult =
      await retryFailedAccountingEvents({
        tenantId,
      });
  }

  await supabase
    .from(
      "accounting_self_healing_actions"
    )
    .update({
      execution_status:
        "executed",
      executed_at:
        new Date().toISOString(),
    })
    .eq("id", actionId);

  return executionResult;
}
