import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function approveRealTimeClose({
  organizationId,
  closeCycleId,
  approvedBy,
  approvalRole,
}) {
  const approval =
    await supabaseAdmin
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

  await supabaseAdmin
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
