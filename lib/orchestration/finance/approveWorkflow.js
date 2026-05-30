import { supabase } from "@/lib/supabase";

import { writeImmutableAudit } from "@/lib/finance/core/writeImmutableAudit";

export async function approveWorkflow({
  workflowId,
  approver,
  notes,
}) {
  const { data, error } =
    await supabase
      .from(
        "accounting_approval_workflows"
      )
      .update({
        approver,
        notes,
        status: "approved",
        approved_at:
          new Date().toISOString(),
      })
      .eq("id", workflowId)
      .select()
      .single();

  if (error) {
    throw error;
  }

  await writeImmutableAudit({
    tenant_id: data.tenant_id,
    entity_type:
      "approval_workflow",
    entity_id: data.id,
    action_type: "approved",
    action_data: {
      approver,
      notes,
    },
  });

  return data;
}
