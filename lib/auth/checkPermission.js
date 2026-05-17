import { supabase } from "@/lib/shared/supabase/client";

export async function checkPermission({

  tenantId,

  role,

  module,

  action = "can_view",

}) {

  const {
    data,
    error,
  } = await supabase
    .from(
      "role_permissions"
    )
    .select("*")
    .eq(
      "tenant_id",
      tenantId
    )
    .eq(
      "role",
      role
    )
    .eq(
      "module",
      module
    )
    .single();

  if (error || !data) {

    console.error(
      "PERMISSION ERROR",
      error
    );

    return false;
  }

  return Boolean(
    data[action]
  );
}
