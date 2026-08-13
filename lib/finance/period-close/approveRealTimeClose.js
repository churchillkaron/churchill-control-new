import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

export async function approveRealTimeClose({
  organizationId,
  closeCycleId,
  approvedBy,
  approvalRole = null,
}) {
  const resolvedOrganizationId = required(organizationId, "organizationId");
  const resolvedCloseCycleId = required(closeCycleId, "closeCycleId");
  const resolvedApprovedBy = required(approvedBy, "approvedBy");

  const { data: cycle, error: cycleError } = await supabaseAdmin
    .from("real_time_close_cycles")
    .select("id, organization_id, entity_id, finalized, close_status")
    .eq("organization_id", resolvedOrganizationId)
    .eq("id", resolvedCloseCycleId)
    .maybeSingle();

  if (cycleError) throw cycleError;
  if (!cycle) throw new Error("Real-time close cycle not found");

  const { data: approval, error: approvalError } = await supabaseAdmin
    .from("real_time_close_approvals")
    .insert({
      organization_id: resolvedOrganizationId,
      entity_id: cycle.entity_id || null,
      close_cycle_id: resolvedCloseCycleId,
      approved_by: resolvedApprovedBy,
      approval_role: approvalRole,
    })
    .select()
    .single();

  if (approvalError) throw approvalError;

  const { data: updatedCycle, error: updateError } = await supabaseAdmin
    .from("real_time_close_cycles")
    .update({ finalized: true, close_status: "closed" })
    .eq("organization_id", resolvedOrganizationId)
    .eq("id", resolvedCloseCycleId)
    .select("id")
    .maybeSingle();

  if (updateError) throw updateError;
  if (!updatedCycle) throw new Error("Real-time close cycle not found");

  return approval;
}
