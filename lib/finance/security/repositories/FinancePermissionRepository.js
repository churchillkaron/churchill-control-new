import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function listFinancePermissions() {
  const { data, error } = await supabaseAdmin
    .from("finance_permissions")
    .select("*")
    .order("permission_key", { ascending: true });

  if (error) throw error;

  return data || [];
}

export async function listFinanceRoles() {
  const { data, error } = await supabaseAdmin
    .from("finance_roles")
    .select("*")
    .order("role_name", { ascending: true });

  if (error) throw error;

  return data || [];
}

export async function listUserFinanceRoles() {
  const { data, error } = await supabaseAdmin
    .from("user_finance_roles")
    .select(`
      *,
      finance_roles (
        id,
        role_name
      ),
      finance_permissions (
        id,
        permission_key
      )
    `);

  if (error) throw error;

  return data || [];
}

export async function grantFinancePermissionRecord({
  roleId,
  permissionKey,
  grantedBy = "system",
}) {
  if (!roleId) throw new Error("roleId required");
  if (!permissionKey) throw new Error("permissionKey required");

  const { data: permission, error: permissionError } =
    await supabaseAdmin
      .from("finance_permissions")
      .upsert(
        {
          permission_key: permissionKey,
          created_by: grantedBy,
        },
        {
          onConflict: "permission_key",
        }
      )
      .select()
      .single();

  if (permissionError) throw permissionError;

  const { data, error } = await supabaseAdmin
    .from("finance_role_permissions")
    .upsert(
      {
        role_id: roleId,
        permission_id: permission.id,
        permission_key: permissionKey,
        granted_by: grantedBy,
        granted_at: new Date().toISOString(),
      },
      {
        onConflict: "role_id,permission_id",
      }
    )
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function assignFinanceRoleRecord({
  userId,
  roleId,
  permissionId = null,
  assignedBy = "system",
}) {
  if (!userId) throw new Error("userId required");
  if (!roleId) throw new Error("roleId required");

  const { data, error } = await supabaseAdmin
    .from("user_finance_roles")
    .insert({
      user_id: userId,
      role_id: roleId,
      permission_id: permissionId,
      assigned_by: assignedBy,
      assigned_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}
