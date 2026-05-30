import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

export async function buildOrganizationContext({
  userEmail,
} = {}) {

  const supabase =
    createServerSupabase();

  if (!userEmail) {

    return {
      success: false,
      error: "Missing userEmail",
    };

  }

  // LOAD STAFF ACCOUNT

  const {
    data: staff,
    error: staffError,
  } = await supabase

    .from(
      "staff_accounts"
    )

    .select("*")

    .eq(
      "email",
      userEmail
    )

    .single();

  console.log(
    "STAFF:",
    staff
  );

  if (
    staffError ||
    !staff
  ) {

    return {

      success: false,

      error:
        staffError?.message ||
        "Staff account not found",

    };

  }

  // SUPER ADMIN

  const isSuperAdmin =

    staff.role ===
    "SUPER_ADMIN";

  // LOAD ORGANIZATIONS

  let organizations = [];

  // SUPER ADMIN GETS ALL

  if (isSuperAdmin) {

    const {
      data: allOrganizations,
      error: organizationsError,
    } = await supabase

      .from(
        "organizations"
      )

      .select("*")

      .eq(
        "tenant_id",
        staff.tenant_id
      );

    console.log(
      "SUPER ADMIN ORGANIZATIONS:",
      allOrganizations
    );

    console.log(
      "SUPER ADMIN ORGANIZATION ERROR:",
      organizationsError
    );

    organizations =
      allOrganizations || [];

  } else {

    // NORMAL MEMBERSHIP

    const {
      data: memberships,
    } = await supabase

      .from(
        "organization_users"
      )

      .select("*")

      .eq(
        "user_email",
        userEmail
      )

      .eq(
        "status",
        "active"
      );

    const organizationIds =

      (memberships || [])
        .map(
          item =>
            item.organization_id
        );

    const {
      data: membershipOrganizations,
    } = await supabase

      .from(
        "organizations"
      )

      .select("*")

      .in(
        "id",
        organizationIds
      );

    organizations =
      membershipOrganizations || [];

  }

  const organization =
    organizations[0] || null;

  return {

    success: true,

    role:
      staff.role,

    tenantId:
      staff.tenant_id,

    organization,

    organizations,

    activeTenantId:
      staff.tenant_id,

    mode:
      organization?.organization_type ||
      "platform",

    isSuperAdmin,

  };

}
