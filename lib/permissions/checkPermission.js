import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACTION_ALIASES = {
  view: "can_view",
  read: "can_view",
  can_view: "can_view",
  create: "can_create",
  can_create: "can_create",
  update: "can_update",
  edit: "can_update",
  can_update: "can_update",
  delete: "can_delete",
  can_delete: "can_delete",
};

function parsePermission({ permission_key, module, action }) {
  if (module) {
    return {
      module,
      action: ACTION_ALIASES[action] || action || "can_view",
    };
  }

  const raw = String(permission_key || "").trim();

  if (!raw) {
    return {
      module: null,
      action: null,
    };
  }

  const parts = raw.split(/[.:]/).filter(Boolean);
  const lastPart = parts[parts.length - 1];
  const resolvedAction = ACTION_ALIASES[lastPart];

  if (resolvedAction && parts.length > 1) {
    return {
      module: parts.slice(0, -1).join("."),
      action: resolvedAction,
    };
  }

  return {
    module: raw,
    action: "can_view",
  };
}

async function resolveRole(userId, suppliedRole) {
  if (suppliedRole) {
    return String(suppliedRole).trim();
  }

  if (!userId) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("staff_accounts")
    .select("role")
    .or(`id.eq.${userId},auth_user_id.eq.${userId}`)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.role || null;
}

export default async function checkPermission({
  organization_id,
  organizationId,
  user_id,
  role,
  permission_key,
  module,
  action,
}) {
  try {
    const resolvedOrganizationId =
      organizationId || organization_id || null;

    if (!resolvedOrganizationId) {
      return {
        allowed: false,
        reason: "ORGANIZATION_REQUIRED",
      };
    }

    const resolvedRole = await resolveRole(user_id, role);

    if (!resolvedRole) {
      return {
        allowed: false,
        reason: "ROLE_NOT_FOUND",
      };
    }

    if (["OWNER", "SUPER_ADMIN"].includes(resolvedRole.toUpperCase())) {
      return {
        allowed: true,
        role: resolvedRole,
      };
    }

    const permission = parsePermission({
      permission_key,
      module,
      action,
    });

    if (!permission.module || !permission.action) {
      return {
        allowed: false,
        reason: "PERMISSION_REQUIRED",
      };
    }

    const allowedColumns = new Set([
      "can_view",
      "can_create",
      "can_update",
      "can_delete",
    ]);

    if (!allowedColumns.has(permission.action)) {
      return {
        allowed: false,
        reason: "INVALID_PERMISSION_ACTION",
      };
    }

    const { data, error } = await supabaseAdmin
      .from("role_permissions")
      .select("role,module,can_view,can_create,can_update,can_delete")
      .eq("organization_id", resolvedOrganizationId)
      .eq("role", resolvedRole)
      .eq("module", permission.module)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return {
      allowed: Boolean(data?.[permission.action]),
      role: resolvedRole,
      module: permission.module,
      action: permission.action,
    };
  } catch (error) {
    return {
      allowed: false,
      error: error?.message || "Permission check failed",
    };
  }
}
