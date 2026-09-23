import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

function normalize(value) {
  return text(value).toLowerCase();
}

function unique(values) {
  return [...new Set((values || []).map(normalize).filter(Boolean))];
}

async function generalRolePermissions({ organizationId, role }) {
  const roleKey = text(role).toUpperCase();
  if (!roleKey) return [];
  const result = await supabaseAdmin.from("role_permissions")
    .select("module,can_view,can_create,can_update,can_delete")
    .eq("organization_id", organizationId)
    .eq("role", roleKey)
    .eq("can_view", true);
  if (result.error) throw result.error;
  return (result.data || []).flatMap((row) => {
    const module = normalize(row.module);
    if (!module) return [];
    const permissions = [module];
    if (row.can_create) permissions.push(`${module}.create`);
    if (row.can_update) permissions.push(`${module}.update`);
    if (row.can_delete) permissions.push(`${module}.delete`);
    return permissions;
  });
}

async function operationsPermissions({ organizationId, userId }) {
  if (!userId) return [];
  const assignments = await supabaseAdmin.from("user_operations_roles")
    .select("role_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (assignments.error) throw assignments.error;
  const roleIds = [...new Set((assignments.data || []).map((row) => row.role_id).filter(Boolean))];
  if (!roleIds.length) return [];
  const permissions = await supabaseAdmin.from("operations_role_permissions")
    .select("permission_key")
    .eq("organization_id", organizationId)
    .in("role_id", roleIds);
  if (permissions.error) throw permissions.error;
  return (permissions.data || []).map((row) => row.permission_key).filter(Boolean);
}

async function financePermissions({ organizationId, userId }) {
  if (!userId) return [];
  const assignments = await supabaseAdmin.from("user_finance_roles")
    .select("role_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId);
  if (assignments.error) throw assignments.error;
  const roleIds = [...new Set((assignments.data || []).map((row) => row.role_id).filter(Boolean))];
  if (!roleIds.length) return [];
  const permissions = await supabaseAdmin.from("finance_permissions")
    .select("permission_key")
    .eq("organization_id", organizationId)
    .in("role_id", roleIds);
  if (permissions.error) throw permissions.error;
  return (permissions.data || []).map((row) => row.permission_key).filter(Boolean);
}

export async function resolveStaffPortalEffectivePermissions({
  organizationId,
  userId,
  role = null,
  basePermissions = [],
} = {}) {
  if (!text(organizationId)) throw new Error("STAFF_PORTAL_ORGANIZATION_REQUIRED");
  if ((basePermissions || []).some((permission) => normalize(permission) === "*")) {
    return { permissions: ["*"], sources: ["full_access_role"] };
  }

  const [general, operations, finance] = await Promise.all([
    generalRolePermissions({ organizationId, role }),
    operationsPermissions({ organizationId, userId }),
    financePermissions({ organizationId, userId }),
  ]);

  return {
    permissions: unique([...(basePermissions || []), ...general, ...operations, ...finance]),
    sources: [
      ...(basePermissions?.length ? ["organization_access"] : []),
      ...(general.length ? ["role_permissions"] : []),
      ...(operations.length ? ["operations_roles"] : []),
      ...(finance.length ? ["finance_roles"] : []),
    ],
  };
}

export default Object.freeze({ resolve: resolveStaffPortalEffectivePermissions });
