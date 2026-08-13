import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

export async function checkFinancePermission({
  organizationId,
  organization_id,
  userId,
  user_id,
  permissionKey,
  permission_key,
  fullAccess = false,
}) {
  const resolvedOrganizationId = required(
    organizationId || organization_id,
    "organization_id"
  );
  const resolvedUserId = required(userId || user_id, "authenticated user");
  const resolvedPermissionKey = required(
    permissionKey || permission_key,
    "permission_key"
  );

  if (resolvedUserId === "system") {
    throw new Error("System identity is not valid for interactive Finance authorization");
  }

  if (fullAccess === true) {
    return true;
  }

  const { data: assignments, error: assignmentError } = await supabaseAdmin
    .from("user_finance_roles")
    .select("role_id")
    .eq("organization_id", resolvedOrganizationId)
    .eq("user_id", resolvedUserId);

  if (assignmentError) throw assignmentError;

  const roleIds = [
    ...new Set((assignments || []).map((row) => row.role_id).filter(Boolean)),
  ];

  if (!roleIds.length) {
    throw new Error(`Permission denied: ${resolvedPermissionKey}`);
  }

  const { data: permission, error: permissionError } = await supabaseAdmin
    .from("finance_permissions")
    .select("id")
    .eq("organization_id", resolvedOrganizationId)
    .in("role_id", roleIds)
    .eq("permission_key", resolvedPermissionKey)
    .limit(1)
    .maybeSingle();

  if (permissionError) throw permissionError;

  if (!permission) {
    throw new Error(`Permission denied: ${resolvedPermissionKey}`);
  }

  return true;
}
