import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

// =====================================
// CHECK FINANCE PERMISSION
// =====================================

export async function checkFinancePermission({

  userId,

  permissionKey,

}) {

  // -----------------------------------
  // SYSTEM AUTOMATION BYPASS
  // -----------------------------------

  if (
    userId === "system"
  ) {

    return true;

  }

  const {
    data,
    error,
  } = await supabaseAdmin

    .from("user_finance_roles")

    .select(`
      role_id,

      finance_roles (
        id,
        role_name
      ),

      finance_permissions (
        permission_key
      )
    `)

    .eq("user_id", userId);

  if (error) {

    throw error;

  }

  const permissions = [];

  for (const row of data || []) {

    const perms =
      row.finance_permissions || [];

    for (const perm of perms) {

      permissions.push(
        perm.permission_key
      );

    }

  }

  const allowed =
    permissions.includes(
      permissionKey
    );

  if (!allowed) {

    throw new Error(

      `Permission denied:
       ${permissionKey}`

    );

  }

  return true;

}
