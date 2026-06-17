import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

export async function buildAccessRuntime({
  userEmail,
}) {

  const supabase =
    createServerSupabase();

  if (!userEmail) {

    return {
      success: false,
      error: "Missing userEmail",
    };

  }

  const {
    data: staff,
    error: staffError,
  } = await supabase
    .from("staff_accounts")
    .select("*")
    .eq("email", userEmail)
    .single();

  if (staffError || !staff) {

    return {
      success: false,
      error:
        staffError?.message ||
        "Staff account not found",
    };

  }

  const isSuperAdmin =
    staff.role === "SUPER_ADMIN";

  const {
    data: memberships,
    error: membershipError,
  } = await supabase
    .from("organization_users")
    .select("*")
    .eq("staff_account_id", staff.id)
    .eq("status", "active");

  if (membershipError) {

    return {
      success: false,
      error: membershipError.message,
    };

  }

  return {
    success: true,
    staff,
    userEmail,
    tenantId: staff.tenant_id,
    activeOrganizationId:
      staff.active_organization_id,
    role: staff.role,
    isSuperAdmin,
    memberships: memberships || [],
  };

}
