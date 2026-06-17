/**
 * HUMAN-IN-THE-LOOP APPROVAL SYSTEM
 * Final safety layer for autonomous execution
 */

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function pushToApprovalQueue({
  organizationId,
  executionPlan,
  decisions
}) {
  const items = executionPlan?.executionPlan || [];

  const queued = [];

  for (const item of items) {

    // Only critical requires approval
    if (item.mode === "approval_required") {

      const { data, error } = await supabaseAdmin
        .from("ai_approval_queue")
        .insert({
          organization_id: organizationId,
          type: item.issue,
          payload: item,
          status: "pending",
          priority: item.severity,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (!error) {
        queued.push(data);
      }
    }
  }

  return {
    queued,
    count: queued.length,
  };
}
