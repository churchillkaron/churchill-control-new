import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runSelfHealingEngine({
  tenantId,
}) {
  const actions = [];

  const { data: failedEvents } =
    await supabase
      .from("accounting_event_bus")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "failed");

  for (const event of failedEvents || []) {
    actions.push({
      tenant_id: tenantId,
      trigger_type:
        "FAILED_EVENT",
      reference_id:
        event.id,
      detected_issue:
        "Accounting event failed",
      proposed_fix:
        "Retry event processing",
      auto_fix_payload: {
        action: "retry_event",
        eventId: event.id,
      },
    });
  }

  const { data: bankIssues } =
    await supabase
      .from("bank_reconciliations")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq(
        "reconciliation_status",
        "out_of_balance"
      );

  for (const item of bankIssues || []) {
    actions.push({
      tenant_id: tenantId,
      trigger_type:
        "BANK_RECONCILIATION",
      reference_id:
        item.id,
      detected_issue:
        "Bank reconciliation mismatch",
      proposed_fix:
        "Force reconciliation review",
      auto_fix_payload: {
        action:
          "manual_reconciliation_review",
        reconciliationId:
          item.id,
      },
    });
  }

  if (actions.length === 0) {
    return [];
  }

  const { data, error } =
    await supabase
      .from(
        "accounting_self_healing_actions"
      )
      .insert(actions)
      .select();

  if (error) {
    throw error;
  }

  return data;
}
