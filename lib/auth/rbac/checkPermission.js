import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function checkPermission({
  tenant_id,
  role,
  permission_key,
}) {

  try {

    if (role === "owner") {

      return {
        allowed: true,
      };
    }

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("role_permissions")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      )
      .eq(
        "role",
        role
      )
      .eq(
        "permission_key",
        permission_key
      )
      .limit(1);

    if (error) {
      throw error;
    }

    return {
      allowed:
        data?.length > 0,
    };

  } catch (error) {

    return {
      allowed: false,
      error:
        error.message,
    };
  }
}
