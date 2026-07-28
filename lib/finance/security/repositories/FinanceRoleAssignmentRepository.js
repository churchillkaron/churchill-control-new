import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function revokeFinanceRoleAssignmentRecord({
  organizationId,
  assignmentId,
  revokedBy,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!assignmentId) throw new Error("assignmentId required");
  if (!revokedBy) throw new Error("revokedBy required");

  const { data: assignment, error: readError } = await supabaseAdmin
    .from("user_finance_roles")
    .select("id, organization_id, user_id, role_id, assigned_by, assigned_at")
    .eq("organization_id", organizationId)
    .eq("id", assignmentId)
    .maybeSingle();

  if (readError) throw readError;
  if (!assignment) throw new Error("Finance role assignment not found");

  const { error: deleteError } = await supabaseAdmin
    .from("user_finance_roles")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", assignmentId);

  if (deleteError) throw deleteError;

  return {
    ...assignment,
    revoked_by: revokedBy,
    revoked_at: new Date().toISOString(),
  };
}
