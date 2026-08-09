import { supabase } from "@/lib/shared/supabase/client";

export async function checkPermission({
  organizationId,
  role,
  module,
  action = "can_view",
}) {
  if (!organizationId || !role || !module) {
    return false;
  }

  const normalizedRole = String(role).trim();

  if (["OWNER", "SUPER_ADMIN"].includes(normalizedRole.toUpperCase())) {
    return true;
  }

  const allowedActions = new Set([
    "can_view",
    "can_create",
    "can_update",
    "can_delete",
  ]);

  if (!allowedActions.has(action)) {
    return false;
  }

  const { data, error } = await supabase
    .from("role_permissions")
    .select("role,module,can_view,can_create,can_update,can_delete")
    .eq("organization_id", organizationId)
    .eq("role", normalizedRole)
    .eq("module", module)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error("PERMISSION_ERROR", error);
    }

    return false;
  }

  return Boolean(data[action]);
}
