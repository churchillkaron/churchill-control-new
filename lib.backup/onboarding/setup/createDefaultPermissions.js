import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createDefaultPermissions({
  tenant_id,
}) {

  const permissions = [

    {
      role: "owner",
      permission_key:
        "*",
    },

    {
      role: "admin",
      permission_key:
        "manage_system",
    },

    {
      role: "manager",
      permission_key:
        "manage_operations",
    },

    {
      role: "accounting",
      permission_key:
        "manage_finance",
    },

    {
      role: "staff",
      permission_key:
        "view_staff",
    },
  ];

  const inserts =
    permissions.map(
      (item) => ({
        tenant_id,
        role:
          item.role,
        permission_key:
          item.permission_key,
        created_at:
          new Date().toISOString(),
      })
    );

  const {
    error,
  } = await supabaseAdmin
    .from(
      "role_permissions"
    )
    .insert(inserts);

  if (error) {
    throw error;
  }

  return {
    success: true,
  };
}
