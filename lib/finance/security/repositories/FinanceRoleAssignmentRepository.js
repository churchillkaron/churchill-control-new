import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { listFinanceRoles } from "@/lib/finance/security/repositories/FinancePermissionRepository";

function required(value, field) {
  if (!value) throw new Error(`${field} required`);
  return value;
}

async function assertStaffMembership({ organizationId, userId }) {
  const { data: staff, error: staffError } = await supabaseAdmin
    .from("staff_accounts")
    .select("id, auth_user_id, active_organization_id, active")
    .eq("auth_user_id", userId)
    .eq("active", true);

  if (staffError) throw staffError;

  const staffIds = (staff || []).map((row) => row.id);
  const directlyScoped = (staff || []).some(
    (row) => String(row.active_organization_id) === String(organizationId)
  );
  let membershipScoped = false;

  if (!directlyScoped && staffIds.length) {
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("organization_users")
      .select("id")
      .eq("organization_id", organizationId)
      .in("staff_account_id", staffIds)
      .limit(1)
      .maybeSingle();

    if (membershipError) throw membershipError;
    membershipScoped = Boolean(membership);
  }

  if (!directlyScoped && !membershipScoped) {
    throw new Error("Staff member does not belong to this organisation");
  }
}

export async function assignFinanceRoleAssignmentRecord({
  organizationId,
  userId,
  roleId,
  assignedBy,
}) {
  required(organizationId, "organizationId");
  required(userId, "userId");
  required(roleId, "roleId");
  required(assignedBy, "assignedBy");

  const roles = await listFinanceRoles(organizationId);
  const role = roles.find((candidate) => String(candidate.id) === String(roleId));
  if (!role) throw new Error("Finance role not found");

  await assertStaffMembership({ organizationId, userId });

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("user_finance_roles")
    .select("id, organization_id, user_id, role_id, assigned_by, assigned_at")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .order("assigned_at", { ascending: true });

  if (existingError) throw existingError;

  const current = (existing || [])[0] || null;
  const duplicates = (existing || []).slice(1);

  if (duplicates.length) {
    const { error: cleanupError } = await supabaseAdmin
      .from("user_finance_roles")
      .delete()
      .eq("organization_id", organizationId)
      .in("id", duplicates.map((row) => row.id));

    if (cleanupError) throw cleanupError;
  }

  if (current && String(current.role_id) === String(roleId)) {
    return {
      ...current,
      role_code: role.role_code,
      role_name: role.role_name,
      already_assigned: true,
      changed: false,
    };
  }

  if (current) {
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("user_finance_roles")
      .update({
        role_id: roleId,
        assigned_by: assignedBy,
        assigned_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId)
      .eq("id", current.id)
      .select("id, organization_id, user_id, role_id, assigned_by, assigned_at")
      .single();

    if (updateError) throw updateError;

    return {
      ...updated,
      role_code: role.role_code,
      role_name: role.role_name,
      already_assigned: false,
      changed: true,
    };
  }

  const { data: created, error: createError } = await supabaseAdmin
    .from("user_finance_roles")
    .insert({
      organization_id: organizationId,
      user_id: userId,
      role_id: roleId,
      assigned_by: assignedBy,
      assigned_at: new Date().toISOString(),
    })
    .select("id, organization_id, user_id, role_id, assigned_by, assigned_at")
    .single();

  if (createError) throw createError;

  return {
    ...created,
    role_code: role.role_code,
    role_name: role.role_name,
    already_assigned: false,
    changed: false,
  };
}

export async function revokeFinanceRoleAssignmentRecord({
  organizationId,
  assignmentId,
  revokedBy,
}) {
  required(organizationId, "organizationId");
  required(assignmentId, "assignmentId");
  required(revokedBy, "revokedBy");

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
