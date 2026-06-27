import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function approveRealTimeClose({
  organizationId,
  closeCycleId,
  approvedBy,
  approvalRole,
}) {
  const approval =
    await supabase
      .from(
        "real_time_close_approvals"
      )
      .insert({
        organization_id: organizationId,
        close_cycle_id:
          closeCycleId,
        approved_by:
          approvedBy,
        approval_role:
          approvalRole,
      })
      .select()
      .single();

  await supabase
    .from(
      "real_time_close_cycles"
    )
    .update({
      finalized: true,
      close_status:
        "closed",
    })
    .eq("id", closeCycleId);

  return approval.data;
}
