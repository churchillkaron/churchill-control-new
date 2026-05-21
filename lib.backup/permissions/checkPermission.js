import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function checkPermission({
  tenant_id,
  user_id,
  permission_key,
}) {
  try {
    const { data: user } = await supabaseAdmin
      .from("staff_accounts")
      .select("role")
      .eq("id", user_id)
      .single();

    if (!user) {
      return {
        allowed: false,
        reason: "USER_NOT_FOUND",
      };
    }

    const { data: permissions } = await supabaseAdmin
      .from("role_permissions")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("role", user.role)
      .eq("permission_key", permission_key);

    return {
      allowed: permissions?.length > 0,
      role: user.role,
    };
  } catch (error) {
    return {
      allowed: false,
      error: error.message,
    };
  }
}
